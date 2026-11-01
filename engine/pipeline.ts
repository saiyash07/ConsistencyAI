import { extractClaims } from "./llm/claims";
import { explainWithLLM } from "./llm/explain";
import { mapLimit } from "./llm/json";
import { compareClaims } from "./llm/relations";
import { ruleBasedFlags } from "./native";
import { detectOutliers } from "./outliers";
import { summarizePairs } from "./pairs";
import { ProviderError } from "./providers/types";
import type { AIProvider } from "./providers/types";
import { claimMetric, combineScores, semanticMetric, structuralMetric, textualMetric } from "./scoring";
import { semanticSimilarity, textualSimilarity } from "./similarity";
import { analyzeStructure } from "./structure";
import { ruleSummary } from "./summary";
import { DEFAULT_WEIGHTS } from "./types";
import type { AnalysisRequest, AnalysisResult, Claim, ClaimRelation, SimilarityMatrix, StageInfo } from "./types";
import { sanitizeWeights } from "./validation";

export interface PipelineDeps {
  /** Required for mode "hybrid"; ignored for "native". */
  provider?: AIProvider;
  /** Max parallel LLM calls (default 3). */
  concurrency?: number;
  now?: () => Date;
  makeId?: () => string;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}

export const NATIVE_LIMITATIONS = [
  "Native mode uses only lexical and structural techniques. It cannot judge meaning or factual claims.",
  "Semantic agreement and claim agreement are unavailable in native mode and are not estimated.",
  "Rule-based flags are candidates for human review, not verified contradictions.",
];

export const GENERAL_LIMITATIONS = [
  "Consistency is not correctness: responses can agree and still all be wrong, or disagree while one is right.",
  "TF-IDF similarity measures shared vocabulary only; it is not a measure of meaning.",
  "Structural checks (requested item counts, formats) are heuristics.",
];

const describeError = (e: unknown) => (e instanceof Error ? e.message : String(e));
const stage = (status: StageInfo["status"], reason?: string): StageInfo => ({ status, reason });

export async function runAnalysis(req: AnalysisRequest, deps: PipelineDeps = {}): Promise<AnalysisResult> {
  const { provider } = deps;
  const hybrid = req.mode === "hybrid";
  if (hybrid && !provider) throw new ProviderError("bad_request", "Hybrid mode requires a configured provider.");
  const progress = deps.onProgress ?? (() => {});
  const limit = deps.concurrency ?? 3;
  const ids = req.responses.map((r) => r.id);
  const warnings: string[] = [];
  const limitations = [...GENERAL_LIMITATIONS];
  const weights = { ...DEFAULT_WEIGHTS, ...sanitizeWeights(req.weights) };

  // ── Deterministic modules ────────────────────────────────────────────────
  progress("Computing textual similarity…");
  const textual = textualSimilarity(ids, req.responses.map((r) => r.text));
  progress("Analysing structure…");
  const structure = analyzeStructure(req.question, req.responses);

  const stages: AnalysisResult["stages"] = {
    textual: stage("ok"),
    semantic: stage("skipped", "Native mode does not use an AI model."),
    structure: stage("ok"),
    claims: stage("skipped", "Native mode does not use an AI model."),
    contradictions: stage("skipped", "Native mode does not use an AI model."),
    explanation: stage("ok"),
  };

  let semantic: SimilarityMatrix | null = null;
  let claims: Claim[] = [];
  let relations: ClaimRelation[] = [];
  let claimsOk = false;
  let claimReason: string | undefined = hybrid ? undefined : "Claim analysis requires an AI provider (native mode selected).";
  let semanticReason: string | undefined = hybrid ? undefined : "Semantic analysis requires an embedding model (native mode selected).";

  // ── LLM-assisted modules ─────────────────────────────────────────────────
  if (hybrid && provider) {
    const authErrors: ProviderError[] = [];
    const noteAuth = (e: unknown) => {
      if (e instanceof ProviderError && e.code === "auth") authErrors.push(e);
    };

    const semanticTask = (async () => {
      if (!provider.supportsEmbeddings) {
        semanticReason = `${provider.id === "groq" ? "Groq" : provider.id} has no embedding model configured; semantic analysis is unavailable (textual similarity is NOT substituted).`;
        stages.semantic = stage("unavailable", semanticReason);
        return;
      }
      progress("Generating embeddings…");
      try {
        const vecs = await provider.embed(req.responses.map((r) => r.text), deps.signal);
        semantic = semanticSimilarity(ids, vecs);
        stages.semantic = stage("ok");
      } catch (e) {
        noteAuth(e);
        semanticReason = `Embedding request failed: ${describeError(e)}`;
        stages.semantic = stage("failed", semanticReason);
      }
    })();

    const claimTask = (async () => {
      progress("Extracting claims…");
      let counter = 0;
      const nextId = () => `C${++counter}`;
      const failures: string[] = [];
      // Ids are assigned after extraction so that numbering follows response order.
      const perResponse = await mapLimit(req.responses, limit, async (r) => {
        try {
          return await extractClaims(provider, req.question, r, () => "", deps.signal);
        } catch (e) {
          noteAuth(e);
          failures.push(`${r.label}: ${describeError(e)}`);
          return null;
        }
      });
      for (const list of perResponse) if (list) for (const c of list) { c.id = nextId(); claims.push(c); }
      const okResponses = perResponse.filter((l) => l !== null).length;
      if (failures.length) warnings.push(...failures.map((f) => `Claim extraction failed for ${f}`));
      if (okResponses === 0) {
        claimReason = `Claim extraction failed for every response. ${failures[0] ?? ""}`.trim();
        stages.claims = stage("failed", claimReason);
        stages.contradictions = stage("skipped", "No claims to compare.");
        return;
      }
      const ungrounded = claims.filter((c) => !c.grounded);
      if (ungrounded.length)
        warnings.push(`${ungrounded.length} extracted claim(s) could not be matched to the response text and were excluded from comparison.`);
      stages.claims = failures.length ? stage("ok", `${failures.length} response(s) failed extraction.`) : stage("ok");
      claimsOk = true;

      const usable = claims.filter((c) => c.grounded);
      progress("Comparing claims across responses…");
      const { relations: rel, failures: relFailures } = await compareClaims(
        provider,
        req.question,
        req.responses,
        usable,
        (items, fn) => mapLimit(items, limit, fn),
        deps.signal
      );
      relations = rel;
      for (const f of relFailures) { warnings.push(`Claim comparison failed for ${f}`); }
      const comparedJobs = req.responses.length - 1;
      stages.contradictions =
        relFailures.length >= comparedJobs && comparedJobs > 0 && rel.length === 0
          ? stage("failed", "Claim comparison failed for every response.")
          : relFailures.length
            ? stage("ok", `${relFailures.length} comparison batch(es) failed; results are partial.`)
            : stage("ok");
    })();

    await Promise.all([semanticTask, claimTask]);
    if (authErrors.length && !claimsOk) throw authErrors[0];
    limitations.push(
      "Claim extraction and relation labels are produced by an LLM and can be wrong or vary between providers and runs.",
      "Contradiction detection finds incompatible claims; it does not establish which claim is true."
    );
  } else {
    limitations.push(...NATIVE_LIMITATIONS);
  }

  // ── Derived analyses ─────────────────────────────────────────────────────
  const flags = hybrid ? [] : ruleBasedFlags(req.responses);
  const comparable = stages.contradictions.status === "ok" && claimsOk;
  const pairSummaries = summarizePairs(req.responses, relations);
  const outliers = detectOutliers({
    responses: req.responses,
    textual,
    semantic,
    structure,
    pairs: comparable ? pairSummaries : null,
  });
  const scores = combineScores(
    {
      textual: textualMetric(textual),
      semantic: semanticMetric(semantic, semanticReason),
      claim: claimMetric(comparable ? pairSummaries : null, claimReason ?? stages.contradictions.reason),
      structural: structuralMetric(structure),
    },
    weights
  );

  const result: AnalysisResult = {
    version: 1,
    id: deps.makeId?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: (deps.now?.() ?? new Date()).toISOString(),
    question: req.question,
    responses: req.responses,
    mode: req.mode,
    provider: hybrid && provider ? { provider: provider.id, model: provider.model } : null,
    stages,
    textualSimilarity: textual,
    semanticSimilarity: semantic,
    structure,
    claims,
    relations,
    pairSummaries: comparable ? pairSummaries : [],
    ruleBasedFlags: flags,
    outliers,
    scores,
    explanation: { text: "", source: "rule-based" },
    limitations,
    warnings,
  };
  result.explanation = { text: ruleSummary(result), source: "rule-based" };

  if (hybrid && provider && (claimsOk || semantic)) {
    progress("Writing explanation…");
    try {
      const text = await explainWithLLM(provider, result, deps.signal);
      result.explanation = { text, source: "llm" };
      result.stages.explanation = stage("ok");
    } catch (e) {
      result.stages.explanation = stage("failed", `LLM explanation failed (${describeError(e)}); showing rule-generated summary instead.`);
    }
  }
  return result;
}
