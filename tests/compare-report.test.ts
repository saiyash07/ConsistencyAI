import { describe, expect, it } from "vitest";
import { compareAnalyses, matchClaims } from "../engine/compare";
import { DEMO_SCENARIOS } from "../engine/demo";
import { runAnalysis } from "../engine/pipeline";
import { buildReportHtml } from "../engine/report";
import type { Claim } from "../engine/types";
import { FakeProvider } from "./helpers";

const req = () => {
  const s = DEMO_SCENARIOS[0];
  return { question: s.question, mode: "hybrid" as const, responses: s.responses.map((r, i) => ({ id: `r${i + 1}`, ...r })) };
};
const mk = (id: string, text: string): Claim => ({ id, responseId: "r1", originalText: text, normalizedText: text, subject: "s", predicate: "p", object: null, qualifiers: [], confidence: null, grounded: true });

describe("provider comparison", () => {
  it("matches similar claims one-to-one and keeps the rest separate", () => {
    const m = matchClaims([mk("1", "Canberra is the capital of Australia"), mk("2", "It became capital in 1913")], [mk("3", "Australia capital is Canberra"), mk("4", "Bananas are yellow")]);
    expect(m.matched).toHaveLength(1);
    expect(m.matched[0].a.id).toBe("1");
    expect(m.onlyA.map((c) => c.id)).toEqual(["2"]);
    expect(m.onlyB.map((c) => c.id)).toEqual(["4"]);
  });
  it("reports agreement and disagreement between evaluators without reconciling them", async () => {
    const a = await runAnalysis(req(), { provider: new FakeProvider() });
    const p2 = new FakeProvider();
    const orig = p2.generate.bind(p2);
    // second evaluator that (wrongly) calls everything an agreement – must be shown as a disagreement
    p2.generate = async (o) => {
      const out = await orig(o);
      return out.includes('"relations"') ? out.replace(/"contradiction"/g, '"agreement"') : out;
    };
    const b = await runAnalysis(req(), { provider: p2 });
    const cmp = compareAnalyses(a, b);
    expect(cmp.pairs).toHaveLength(6);
    expect(cmp.pairs.filter((p) => !p.agree).length).toBeGreaterThan(0);
    expect(cmp.verdictAgreementRate).toBeLessThan(1);
    expect(cmp.summary).toMatch(/disagree on/);
    expect(cmp.summary).toMatch(/neither evaluator is assumed to be correct/i);
    expect(cmp.claimCounts.every((c) => c.countA === c.countB)).toBe(true);
    expect(cmp.claimMatches.every((m) => m.onlyA.length === 0 && m.onlyB.length === 0)).toBe(true);
    const same = compareAnalyses(a, a);
    expect(same.verdictAgreementRate).toBe(1);
  });
  it("handles analyses without pair verdicts", async () => {
    const n = await runAnalysis({ ...req(), mode: "native" });
    const cmp = compareAnalyses(n, n);
    expect(cmp.verdictAgreementRate).toBeNull();
    expect(cmp.summary).toMatch(/cannot be assessed/);
  });
});

describe("report export", () => {
  it("includes all required sections and escapes HTML", async () => {
    const r = await runAnalysis({ question: "Q <script>alert(1)</script>?", mode: "native", responses: [
      { id: "a", label: "A", text: "Canberra is the capital." }, { id: "b", label: "B", text: "<b>Sydney</b> is the capital." }] });
    const html = buildReportHtml(r);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    for (const h of ["Original question", "Submitted responses", "Consistency metrics", "Textual similarity", "Semantic similarity", "Extracted claims", "Contradiction", "Structural comparison", "Outlier analysis", "Limitations"])
      expect(html).toContain(h);
    expect(html).toMatch(/none \(native analysis\)/);
  });
  it("never contains credentials", async () => {
    const r = await runAnalysis(req(), { provider: new FakeProvider() });
    expect(buildReportHtml(r)).not.toMatch(/api[-_ ]?key["']?\s*[:=]/i);
  });
});
