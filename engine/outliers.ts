import { median, round } from "./text";
import type {
  OutlierAnalysis,
  OutlierResult,
  PairClaimSummary,
  ResponseInput,
  SimilarityMatrix,
  StructureAnalysis,
} from "./types";

/** Distance of each response from the rest: 1 − mean similarity to the others. */
export function meanDistances(m: SimilarityMatrix): number[] {
  const n = m.values.length;
  return m.values.map((row, i) => {
    let s = 0;
    for (let j = 0; j < n; j++) if (j !== i) s += row[j];
    return 1 - s / (n - 1);
  });
}

/**
 * Robust upper-outlier test: value > median + max(minGap, 2·1.4826·MAD).
 * The absolute minGap prevents flagging tiny differences when responses are near-identical.
 */
export function robustHighOutliers(values: number[], minGap: number): boolean[] {
  if (values.length < 3) return values.map(() => false);
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med)));
  const threshold = med + Math.max(minGap, 2 * 1.4826 * mad);
  return values.map((v) => v > threshold);
}

export interface OutlierInputs {
  responses: ResponseInput[];
  textual: SimilarityMatrix | null;
  semantic: SimilarityMatrix | null;
  structure: StructureAnalysis;
  pairs: PairClaimSummary[] | null;
}

export function detectOutliers(inp: OutlierInputs): OutlierAnalysis {
  const { responses } = inp;
  const n = responses.length;
  if (n < 3) {
    return {
      applicable: false,
      note: "Outlier detection needs at least 3 responses: with two, each is equally 'different' from the other.",
      results: responses.map((r) => ({ responseId: r.id, isOutlier: false, distance: null, reasons: [] })),
    };
  }
  const results: OutlierResult[] = responses.map((r) => ({ responseId: r.id, isOutlier: false, distance: null, reasons: [] }));

  // Signal 1/2: similarity-based distances.
  const signals: Array<{ name: string; d: number[]; gap: number }> = [];
  if (inp.semantic) signals.push({ name: "semantic", d: meanDistances(inp.semantic), gap: 0.1 });
  if (inp.textual) signals.push({ name: "textual", d: meanDistances(inp.textual), gap: 0.2 });
  for (const s of signals) {
    const flags = robustHighOutliers(s.d, s.gap);
    flags.forEach((f, i) => {
      if (f)
        results[i].reasons.push(
          `${s.name === "semantic" ? "Semantically" : "Textually"} far from the others (mean distance ${s.d[i].toFixed(2)} vs median ${median(s.d).toFixed(2)}).`
        );
    });
  }
  const primary = signals[0];
  if (primary) primary.d.forEach((d, i) => (results[i].distance = round(d, 4)));

  // Signal 3: claim disagreement rate (share of decisive relations that are contradictions).
  if (inp.pairs) {
    const rates = responses.map((r) => {
      const mine = inp.pairs!.filter((p) => p.responseAId === r.id || p.responseBId === r.id);
      const decisive = mine.reduce((a, p) => a + p.agreement + p.partial + p.contradiction, 0);
      const contra = mine.reduce((a, p) => a + p.contradiction, 0);
      return decisive === 0 ? 0 : contra / decisive;
    });
    const flags = robustHighOutliers(rates, 0.25);
    flags.forEach((f, i) => {
      if (f) results[i].reasons.push(`Contradicts other responses more often than they contradict each other (${Math.round(rates[i] * 100)}% of its compared claims).`);
    });
  }

  // Signal 4: structural deviations.
  for (const f of inp.structure.findings) {
    const idx = responses.findIndex((r) => r.id === f.responseId);
    if (idx >= 0 && f.severity === "warning") results[idx].reasons.push(f.message);
    else if (idx >= 0 && /much (shorter|longer)/.test(f.message)) results[idx].reasons.push(f.message);
  }

  for (const r of results) r.isOutlier = r.reasons.length > 0;
  return {
    applicable: true,
    note: "An outlier is a response that differs from the others on at least one signal. Being unusual does not mean a response is incorrect.",
    results,
  };
}
