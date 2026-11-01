import { describe, expect, it } from "vitest";
import { DEMO_SCENARIOS } from "../engine/demo";
import { runAnalysis } from "../engine/pipeline";
import { ProviderError } from "../engine/providers/types";
import type { AnalysisRequest, AnalysisResult } from "../engine/types";
import { FakeProvider } from "./helpers";

const scenario = (id: string, mode: "native" | "hybrid" = "native"): AnalysisRequest => {
  const s = DEMO_SCENARIOS.find((x) => x.id === id)!;
  return { question: s.question, mode, responses: s.responses.map((r, i) => ({ id: `r${i + 1}`, ...r })) };
};
const label = (r: AnalysisResult, id: string) => r.responses.find((x) => x.id === id)!.label;

describe("native mode regression on the three demo scenarios", () => {
  it("scenario 1 – flags every conflicting pair except A–C as candidate disagreements, never verified contradictions", async () => {
    const r = await runAnalysis(scenario("factual-contradiction"));
    const pairs = r.ruleBasedFlags.map((f) => `${f.responseAId}-${f.responseBId}`).sort();
    expect(pairs).toEqual(["r1-r2", "r1-r4", "r2-r3", "r2-r4", "r3-r4"]);
    expect(r.relations).toEqual([]);
    expect(r.claims).toEqual([]);
    expect(r.scores.claim.value).toBeNull();
    expect(r.scores.semantic.value).toBeNull();
    expect(r.scores.overall.completeness).toBe("partial");
    expect(r.stages.claims.status).toBe("skipped");
  });
  it("scenario 2 – semantic scores are NOT fabricated; textual similarity stays low for paraphrases", async () => {
    const r = await runAnalysis(scenario("semantic-consistency"));
    expect(r.semanticSimilarity).toBeNull();
    expect(r.scores.semantic.status).toBe("unavailable");
    expect(r.scores.textual.value).toBeLessThan(0.3);
    expect(r.ruleBasedFlags).toEqual([]);
  });
  it("scenario 3 – structural expectations hold", async () => {
    const r = await runAnalysis(scenario("structural-consistency"));
    const byId = Object.fromEntries(r.structure.profiles.map((p) => [p.responseId, p]));
    expect(r.structure.requested.count).toBe(3);
    expect(byId.r2.hasNumberedList).toBe(true);
    expect(byId.r1.hasNumberedList || byId.r4.hasNumberedList).toBe(false);
    expect([byId.r1.estimatedPoints, byId.r2.estimatedPoints, byId.r4.estimatedPoints]).toEqual([3, 3, 3]);
    expect(byId.r3.estimatedPoints).toBe(1);
    expect(r.structure.findings.some((f) => f.responseId === "r3" && f.severity === "warning")).toBe(true);
    expect(r.outliers.results.find((o) => o.responseId === "r3")!.isOutlier).toBe(true);
  });
  it("is deterministic and carries no credentials or provider", async () => {
    const a = await runAnalysis(scenario("factual-contradiction"), { makeId: () => "x", now: () => new Date(0) });
    const b = await runAnalysis(scenario("factual-contradiction"), { makeId: () => "x", now: () => new Date(0) });
    expect(a).toEqual(b);
    expect(a.provider).toBeNull();
  });
  it("hybrid without a provider is rejected", async () => {
    await expect(runAnalysis(scenario("factual-contradiction", "hybrid"))).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("hybrid pipeline (fake deterministic provider – tests plumbing only)", () => {
  it("scenario 1 – extracts claims, finds contradictions, scores claim agreement", async () => {
    const p = new FakeProvider();
    const r = await runAnalysis(scenario("factual-contradiction", "hybrid"), { provider: p });
    expect(r.claims.length).toBe(6);
    expect(r.claims.every((c) => c.grounded)).toBe(true);
    const verdict = (a: string, b: string) => r.pairSummaries.find((x) => x.responseAId === a && x.responseBId === b)?.verdict;
    expect(verdict("r1", "r3")).toBe("agreement");
    expect(verdict("r1", "r2")).toBe("contradiction");
    expect(verdict("r2", "r3")).toBe("contradiction");
    expect(verdict("r1", "r4")).toBe("contradiction");
    expect(r.relations.every((x) => x.source === "llm")).toBe(true);
    // relation labels reference real claims from different responses
    for (const rel of r.relations) {
      const a = r.claims.find((c) => c.id === rel.claimAId)!, b = r.claims.find((c) => c.id === rel.claimBId)!;
      expect(a.responseId).not.toBe(b.responseId);
    }
    expect(r.scores.claim.status).toBe("available");
    expect(r.scores.claim.value).toBeLessThan(1);
    expect(r.scores.overall.completeness).toBe("complete");
    expect(r.explanation.source).toBe("llm");
    expect(r.provider).toEqual({ provider: "gemini", model: "fake-model" });
    expect(JSON.stringify(r)).not.toMatch(/apiKey/);
    expect(label(r, "r1")).toBe("Response A");
  });
  it("scenario 2 – semantic matrix separates the dissenting response", async () => {
    const r = await runAnalysis(scenario("semantic-consistency", "hybrid"), { provider: new FakeProvider() });
    expect(r.semanticSimilarity).not.toBeNull();
    const m = r.semanticSimilarity!.values;
    expect(m[0][1]).toBeGreaterThan(m[0][3]);
    expect(r.outliers.results.find((o) => o.responseId === "r4")!.isOutlier).toBe(true);
    expect(r.scores.semantic.status).toBe("available");
  });
  it("Groq-style provider (no embeddings): semantic is unavailable, textual is not substituted", async () => {
    const p = new FakeProvider();
    p.supportsEmbeddings = false;
    const r = await runAnalysis(scenario("semantic-consistency", "hybrid"), { provider: p });
    expect(r.semanticSimilarity).toBeNull();
    expect(r.stages.semantic.status).toBe("unavailable");
    expect(r.scores.semantic.value).toBeNull();
    expect(r.scores.overall.missing).toContain("semantic");
    expect(r.scores.claim.status).toBe("available");
    expect(p.calls.embed).toBe(0);
  });
  it("partial failure: one response's extraction fails; the rest still analysed and warned", async () => {
    const p = new FakeProvider();
    p.failClaimsFor = "Melbourne is the capital";
    const r = await runAnalysis(scenario("factual-contradiction", "hybrid"), { provider: p });
    expect(r.warnings.join()).toMatch(/Claim extraction failed for Response D/);
    expect(r.claims.some((c) => c.responseId === "r4")).toBe(false);
    expect(r.stages.claims.status).toBe("ok");
    expect(r.scores.claim.status).toBe("available");
  });
  it("relation stage failure leaves deterministic metrics intact and claim score unavailable", async () => {
    const p = new FakeProvider();
    p.failRelations = true;
    const r = await runAnalysis(scenario("factual-contradiction", "hybrid"), { provider: p });
    expect(r.stages.contradictions.status).toBe("failed");
    expect(r.scores.claim.value).toBeNull();
    expect(r.scores.textual.value).not.toBeNull();
    expect(r.scores.overall.completeness).toBe("partial");
  });
  it("embedding failure and explanation failure degrade gracefully", async () => {
    const p = new FakeProvider();
    p.failEmbedding = true;
    p.failExplain = true;
    const r = await runAnalysis(scenario("semantic-consistency", "hybrid"), { provider: p });
    expect(r.stages.semantic.status).toBe("failed");
    expect(r.stages.explanation.status).toBe("failed");
    expect(r.explanation.source).toBe("rule-based");
    expect(r.explanation.text.length).toBeGreaterThan(20);
  });
  it("invalid credentials abort with an auth error instead of an empty report", async () => {
    const p = new FakeProvider();
    p.authError = true;
    await expect(runAnalysis(scenario("factual-contradiction", "hybrid"), { provider: p })).rejects.toMatchObject({ code: "auth" });
  });
  it("ungrounded (invented) claims are excluded from comparison", async () => {
    const p = new FakeProvider();
    const orig = p.generate.bind(p);
    p.generate = async (o) => {
      const out = await orig(o);
      if (out.startsWith('{"claims"')) {
        const j = JSON.parse(out);
        j.claims.push({ originalText: "Moon cheese is a major Australian export", normalizedText: "x", subject: "s", predicate: "p", object: null, qualifiers: [], confidence: 0.5 });
        return JSON.stringify(j);
      }
      return out;
    };
    const r = await runAnalysis(scenario("factual-contradiction", "hybrid"), { provider: p });
    expect(r.claims.filter((c) => !c.grounded).length).toBe(4);
    const ungroundedIds = new Set(r.claims.filter((c) => !c.grounded).map((c) => c.id));
    expect(r.relations.some((x) => ungroundedIds.has(x.claimAId) || ungroundedIds.has(x.claimBId))).toBe(false);
    expect(r.warnings.join()).toMatch(/excluded from comparison/);
  });
});
