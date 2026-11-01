import { pairTextSimilarity } from "./similarity";
import { round } from "./text";
import type { AnalysisResult, Claim, PairVerdict } from "./types";

export interface PairComparisonRow {
  responseAId: string;
  responseBId: string;
  verdictA: PairVerdict;
  verdictB: PairVerdict;
  agree: boolean;
}

export interface ClaimMatchRow {
  responseId: string;
  matched: Array<{ a: Claim; b: Claim; similarity: number }>;
  onlyA: Claim[];
  onlyB: Claim[];
}

export interface ProviderComparison {
  evaluatorA: string;
  evaluatorB: string;
  pairs: PairComparisonRow[];
  /** Share of response pairs where both evaluators reached the same verdict (null if no pairs). */
  verdictAgreementRate: number | null;
  claimMatches: ClaimMatchRow[];
  claimCounts: Array<{ responseId: string; countA: number; countB: number }>;
  scoreDeltas: Array<{ metric: string; a: number | null; b: number | null; delta: number | null }>;
  summary: string;
}

const MATCH_THRESHOLD = 0.5;
const evaluatorName = (r: AnalysisResult) => (r.provider ? `${r.provider.provider} · ${r.provider.model}` : "native");

/** Greedy one-to-one matching of claims between two evaluators for one response. */
export function matchClaims(a: Claim[], b: Claim[]): Pick<ClaimMatchRow, "matched" | "onlyA" | "onlyB"> {
  const cands: Array<{ i: number; j: number; s: number }> = [];
  a.forEach((ca, i) => b.forEach((cb, j) => {
    const s = pairTextSimilarity(ca.normalizedText, cb.normalizedText);
    if (s >= MATCH_THRESHOLD) cands.push({ i, j, s });
  }));
  cands.sort((x, y) => y.s - x.s);
  const usedA = new Set<number>(), usedB = new Set<number>();
  const matched: ClaimMatchRow["matched"] = [];
  for (const c of cands) {
    if (usedA.has(c.i) || usedB.has(c.j)) continue;
    usedA.add(c.i); usedB.add(c.j);
    matched.push({ a: a[c.i], b: b[c.j], similarity: round(c.s, 3) });
  }
  return { matched, onlyA: a.filter((_, i) => !usedA.has(i)), onlyB: b.filter((_, j) => !usedB.has(j)) };
}

/**
 * Compare two analyses of the SAME responses by different evaluators.
 * Disagreements are reported, never reconciled – neither evaluator is assumed correct.
 */
export function compareAnalyses(a: AnalysisResult, b: AnalysisResult): ProviderComparison {
  const pairs: PairComparisonRow[] = [];
  for (const pa of a.pairSummaries) {
    const pb = b.pairSummaries.find(
      (p) => (p.responseAId === pa.responseAId && p.responseBId === pa.responseBId) || (p.responseAId === pa.responseBId && p.responseBId === pa.responseAId)
    );
    if (!pb) continue;
    pairs.push({ responseAId: pa.responseAId, responseBId: pa.responseBId, verdictA: pa.verdict, verdictB: pb.verdict, agree: pa.verdict === pb.verdict });
  }
  const rate = pairs.length ? round(pairs.filter((p) => p.agree).length / pairs.length, 4) : null;
  const claimMatches = a.responses.map((r) => ({
    responseId: r.id,
    ...matchClaims(a.claims.filter((c) => c.responseId === r.id && c.grounded), b.claims.filter((c) => c.responseId === r.id && c.grounded)),
  }));
  const claimCounts = a.responses.map((r) => ({
    responseId: r.id,
    countA: a.claims.filter((c) => c.responseId === r.id).length,
    countB: b.claims.filter((c) => c.responseId === r.id).length,
  }));
  const metrics = ["textual", "semantic", "claim", "structural"] as const;
  const scoreDeltas = [
    ...metrics.map((m) => ({ metric: m, a: a.scores[m].value, b: b.scores[m].value })),
    { metric: "overall", a: a.scores.overall.value, b: b.scores.overall.value },
  ].map((x) => ({ ...x, delta: x.a !== null && x.b !== null ? round(x.b - x.a, 4) : null }));

  const na = evaluatorName(a), nb = evaluatorName(b);
  const disagreements = pairs.filter((p) => !p.agree).length;
  const summary =
    pairs.length === 0
      ? `Neither ${na} nor ${nb} produced comparable pair verdicts, so evaluator agreement cannot be assessed.`
      : disagreements === 0
        ? `${na} and ${nb} reached the same verdict on all ${pairs.length} response pair(s). Agreement between evaluators does not prove the verdicts are right.`
        : `${na} and ${nb} disagree on ${disagreements} of ${pairs.length} response pair(s). Both outputs are shown as produced; neither evaluator is assumed to be correct.`;
  return { evaluatorA: na, evaluatorB: nb, pairs, verdictAgreementRate: rate, claimMatches, claimCounts, scoreDeltas, summary };
}
