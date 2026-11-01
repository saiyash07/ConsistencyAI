import type { AnalysisResult } from "./types";

const pct = (v: number | null) => (v === null ? "n/a" : `${Math.round(v * 100)}%`);

/** Deterministic, template-based summary (no LLM). Always available. */
export function ruleSummary(r: Pick<AnalysisResult, "responses" | "scores" | "pairSummaries" | "outliers" | "structure" | "ruleBasedFlags" | "mode">): string {
  const label = (id: string) => r.responses.find((x) => x.id === id)?.label ?? id;
  const parts: string[] = [];
  const o = r.scores.overall;
  parts.push(
    o.value === null
      ? "No overall consistency score could be computed."
      : `Overall consistency among the ${r.responses.length} responses is ${pct(o.value)}${o.completeness === "partial" ? " (partial: some metrics were unavailable)" : ""}. This measures agreement between responses, not correctness.`
  );
  parts.push(`Textual (word-overlap) similarity is ${pct(r.scores.textual.value)}; structural consistency is ${pct(r.scores.structural.value)}.`);
  if (r.scores.semantic.value !== null) parts.push(`Semantic (embedding) agreement is ${pct(r.scores.semantic.value)}.`);
  const contra = r.pairSummaries.filter((p) => p.verdict === "contradiction");
  if (r.scores.claim.value !== null) {
    parts.push(
      contra.length
        ? `Claim analysis found contradictions between: ${contra.map((p) => `${label(p.responseAId)} and ${label(p.responseBId)}`).join("; ")}. The analysis does not decide which side is correct.`
        : "Claim analysis found no contradictions between the compared claims."
    );
  } else if (r.mode === "native") {
    parts.push(
      r.ruleBasedFlags.length
        ? `Rule-based checks flagged ${r.ruleBasedFlags.length} candidate disagreement(s) for review; native mode cannot verify claims.`
        : "Rule-based checks flagged no candidate disagreements; native mode cannot verify factual claims."
    );
  }
  const outs = r.outliers.results.filter((x) => x.isOutlier);
  if (r.outliers.applicable) parts.push(outs.length ? `Outlier responses: ${outs.map((x) => label(x.responseId)).join(", ")} (unusual, not necessarily wrong).` : "No response stood out as an outlier.");
  return parts.join(" ");
}
