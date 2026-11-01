import { generateValidated } from "./json";
import type { AIProvider } from "../providers/types";
import type { AnalysisResult } from "../types";

export const EXPLAIN_SYSTEM = `You write a short, neutral explanation of an AI-response consistency analysis for a student audience.
Rules:
- Use ONLY the numbers and findings provided. Do not invent facts or figures.
- Do not state which response is factually correct, and do not treat agreement as proof of truth.
- Mention that scores measure consistency among the responses, not correctness.
- 3 to 6 sentences, plain text. Reply with ONLY a JSON object: {"summary":"..."}`;

export function explainPrompt(r: AnalysisResult): string {
  const label = (id: string) => r.responses.find((x) => x.id === id)?.label ?? id;
  const lines = [
    `Question: ${r.question}`,
    `Responses: ${r.responses.map((x) => x.label).join(", ")}`,
    `Overall: ${r.scores.overall.value ?? "n/a"} (${r.scores.overall.completeness})`,
    `Textual similarity: ${r.scores.textual.value ?? "n/a"}`,
    `Semantic agreement: ${r.scores.semantic.value ?? "unavailable"}`,
    `Claim agreement: ${r.scores.claim.value ?? "unavailable"}`,
    `Structural consistency: ${r.scores.structural.value ?? "n/a"}`,
    `Contradicting pairs: ${r.pairSummaries.filter((p) => p.verdict === "contradiction").map((p) => `${label(p.responseAId)} vs ${label(p.responseBId)}`).join("; ") || "none"}`,
    `Agreeing pairs: ${r.pairSummaries.filter((p) => p.verdict === "agreement").map((p) => `${label(p.responseAId)} & ${label(p.responseBId)}`).join("; ") || "none"}`,
    `Outliers: ${r.outliers.results.filter((o) => o.isOutlier).map((o) => label(o.responseId)).join(", ") || "none"}`,
    `Structure findings: ${r.structure.findings.map((f) => f.message).join(" | ") || "none"}`,
  ];
  return lines.join("\n");
}

export async function explainWithLLM(provider: AIProvider, r: AnalysisResult, signal?: AbortSignal): Promise<string> {
  return generateValidated(
    provider,
    EXPLAIN_SYSTEM,
    explainPrompt(r),
    (raw) => {
      const s = (raw as { summary?: unknown })?.summary;
      if (typeof s !== "string" || s.trim().length < 20) throw new Error('missing "summary" string');
      return s.trim().slice(0, 1500);
    },
    signal
  );
}
