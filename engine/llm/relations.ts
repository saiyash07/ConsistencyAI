import { generateValidated } from "./json";
import { RELATIONS } from "../types";
import type { AIProvider } from "../providers/types";
import type { Claim, ClaimRelation, Relation, ResponseInput } from "../types";

export const RELATION_SYSTEM = `You compare factual claims made by different answers to the same question.
Classify how a claim from the ANCHOR answer relates to claims from OTHER answers, using ONLY the claim texts given.
Relation labels:
- "agreement": both claims state the same thing (wording may differ).
- "contradiction": both claims address the same subject/attribute and cannot both be true.
- "partial_agreement": overlapping but not identical (e.g. one is more specific, or they differ in a minor qualifier).
- "additional_information": the other claim adds detail that neither supports nor conflicts with the anchor claim.
- "insufficient_information": related topic but not enough information to compare.
- "uncertain": you cannot reliably decide.
Rules:
- Only output pairs that are genuinely about the same subject/attribute. Never pair unrelated statements.
- Respect qualifiers, dates, conditions and hedges: differing time periods or conditions are NOT contradictions.
- Never decide which claim is factually correct and never treat majority agreement as truth.
- If unsure, use "uncertain".
Reply with ONLY a JSON object.`;

export function relationPrompt(
  question: string,
  anchor: ResponseInput,
  anchorClaims: Claim[],
  others: Array<{ response: ResponseInput; claims: Claim[] }>
): string {
  const fmt = (c: Claim) =>
    `${c.id}: ${c.normalizedText}${c.qualifiers.length ? ` [qualifiers: ${c.qualifiers.join("; ")}]` : ""}`;
  return `Question: """${question}"""

ANCHOR answer "${anchor.label}" claims:
${anchorClaims.map(fmt).join("\n")}

OTHER answers:
${others.map((o) => `Answer "${o.response.label}":\n${o.claims.map(fmt).join("\n")}`).join("\n\n")}

Return JSON:
{"relations":[{"anchorClaimId":"<id from ANCHOR>","otherClaimId":"<id from OTHER>","relation":"agreement|contradiction|partial_agreement|additional_information|insufficient_information|uncertain","explanation":"one short sentence","confidence":0.0-1.0}]}
List every related pair; omit unrelated pairs. If there are none return {"relations":[]}.`;
}

export function makeRelationValidator(anchorIds: Set<string>, otherIds: Set<string>, claims: Map<string, Claim>) {
  return (raw: unknown): ClaimRelation[] => {
    if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { relations?: unknown }).relations))
      throw new Error('expected an object with a "relations" array');
    const seen = new Set<string>();
    const out: ClaimRelation[] = [];
    for (const r of (raw as { relations: unknown[] }).relations) {
      if (typeof r !== "object" || r === null) throw new Error("relation must be an object");
      const o = r as Record<string, unknown>;
      const a = typeof o.anchorClaimId === "string" ? o.anchorClaimId.trim() : "";
      const b = typeof o.otherClaimId === "string" ? o.otherClaimId.trim() : "";
      if (!anchorIds.has(a) || !otherIds.has(b)) continue; // ignore hallucinated ids rather than fail
      if (!RELATIONS.includes(o.relation as Relation)) throw new Error(`unknown relation "${String(o.relation)}"`);
      const key = `${a}|${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const conf = typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1 ? o.confidence : null;
      out.push({
        claimAId: a,
        claimBId: b,
        responseAId: claims.get(a)!.responseId,
        responseBId: claims.get(b)!.responseId,
        relation: o.relation as Relation,
        explanation: typeof o.explanation === "string" ? o.explanation.trim().slice(0, 300) : "",
        confidence: conf,
        source: "llm",
      });
    }
    return out;
  };
}

/** Compare claims across responses: one LLM call per anchor response (anchor vs. all later responses). */
export async function compareClaims(
  provider: AIProvider,
  question: string,
  responses: ResponseInput[],
  claims: Claim[],
  run: <T, R>(items: T[], fn: (item: T) => Promise<R>) => Promise<R[]>,
  signal?: AbortSignal
): Promise<{ relations: ClaimRelation[]; failures: string[] }> {
  const byId = new Map(claims.map((c) => [c.id, c]));
  const byResp = (id: string) => claims.filter((c) => c.responseId === id);
  const jobs = responses
    .map((anchor, i) => ({ anchor, others: responses.slice(i + 1).map((r) => ({ response: r, claims: byResp(r.id) })).filter((o) => o.claims.length > 0) }))
    .filter((j) => byResp(j.anchor.id).length > 0 && j.others.length > 0);

  const failures: string[] = [];
  const results = await run(jobs, async (job) => {
    const anchorClaims = byResp(job.anchor.id);
    const validate = makeRelationValidator(
      new Set(anchorClaims.map((c) => c.id)),
      new Set(job.others.flatMap((o) => o.claims.map((c) => c.id))),
      byId
    );
    try {
      return await generateValidated(provider, RELATION_SYSTEM, relationPrompt(question, job.anchor, anchorClaims, job.others), validate, signal);
    } catch (e) {
      failures.push(`${job.anchor.label}: ${(e as Error).message}`);
      return [] as ClaimRelation[];
    }
  });
  return { relations: results.flat(), failures };
}
