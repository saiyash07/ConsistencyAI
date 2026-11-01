import { mean, round } from "./text";
import { pairValues } from "./similarity";
import { DEFAULT_WEIGHTS } from "./types";
import type {
  ConsistencyScores,
  MetricKey,
  MetricScore,
  PairClaimSummary,
  ScoreWeights,
  SimilarityMatrix,
  StructureAnalysis,
} from "./types";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function textualMetric(m: SimilarityMatrix | null): MetricScore {
  const method = "Mean pairwise TF-IDF cosine similarity (lexical overlap, not meaning).";
  if (!m) return { value: null, status: "unavailable", reason: "Not computed.", method };
  const v = mean(pairValues(m));
  return v === null
    ? { value: null, status: "unavailable", reason: "Need at least two responses.", method }
    : { value: round(clamp01(v), 4), status: "available", method };
}

export function semanticMetric(m: SimilarityMatrix | null, reason?: string): MetricScore {
  const method = "Mean pairwise cosine similarity of embedding vectors (negative values clamped to 0; not rescaled).";
  if (!m) return { value: null, status: "unavailable", reason: reason ?? "No embedding model available.", method };
  const v = mean(pairValues(m));
  return v === null
    ? { value: null, status: "unavailable", reason: "Need at least two responses.", method }
    : { value: round(clamp01(v), 4), status: "available", method };
}

export function claimMetric(pairs: PairClaimSummary[] | null, reason?: string): MetricScore {
  const method =
    "Per response pair: (agreements + 0.5·partial agreements) / (agreements + partial + contradictions). Averaged over pairs that have decisive claim relations. Additional / insufficient / uncertain relations are excluded.";
  if (!pairs) return { value: null, status: "unavailable", reason: reason ?? "Claim analysis did not run.", method };
  const scores = pairs.map((p) => p.agreementScore).filter((s): s is number => s !== null);
  if (scores.length === 0)
    return { value: null, status: "unavailable", reason: reason ?? "No decisive claim relations were found.", method };
  return { value: round(mean(scores) as number, 4), status: "available", method };
}

export function structuralMetric(s: StructureAnalysis): MetricScore {
  const method =
    "Mean pairwise structural similarity (50% length ratio + 50% agreement on heading/bullet/numbered/multi-paragraph flags); blended 70/30 with agreement on requested-element coverage when the question asks for N items.";
  return s.score === null
    ? { value: null, status: "unavailable", reason: "Need at least two responses.", method }
    : { value: s.score, status: "available", method };
}

/**
 * Overall indicator = Σ w_k·m_k / Σ w_k over AVAILABLE metrics only.
 * Unavailable metrics are excluded (never treated as zero) and the result is
 * flagged "partial". With no available metric the result is null.
 */
export function combineScores(
  parts: Record<MetricKey, MetricScore>,
  weights: ScoreWeights = DEFAULT_WEIGHTS
): ConsistencyScores {
  const keys = Object.keys(parts) as MetricKey[];
  const available = keys.filter((k) => parts[k].value !== null && weights[k] > 0);
  const missing = keys.filter((k) => parts[k].value === null);
  const wsum = available.reduce((a, k) => a + weights[k], 0);
  const applied: Partial<ScoreWeights> = {};
  let value: number | null = null;
  if (wsum > 0) {
    value = 0;
    for (const k of available) {
      applied[k] = round(weights[k] / wsum, 4);
      value += (weights[k] / wsum) * (parts[k].value as number);
    }
    value = round(value, 4);
  }
  const completeness = value === null ? "unavailable" : missing.length === 0 ? "complete" : "partial";
  const note =
    completeness === "complete"
      ? "All four metrics contributed. This score measures consistency among the submitted responses, not factual correctness."
      : completeness === "partial"
        ? `Partial score: ${missing.join(", ")} unavailable and excluded (not counted as zero). Weights were renormalised over the remaining metrics. This score measures consistency among responses, not factual correctness.`
        : "No metric was available, so no overall score can be given.";
  return {
    ...parts,
    overall: { value, completeness, missing, weightsConfigured: weights, weightsApplied: applied, note },
  };
}
