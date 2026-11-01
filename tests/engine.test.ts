import { describe, expect, it } from "vitest";
import { normalizeText, splitSentences, tokenize, contentTokens, countWords } from "../engine/text";
import { cosine, pairValues, semanticSimilarity, tfidfVectors, textualSimilarity } from "../engine/similarity";
import { analyzeStructure, detectRequestedElements, estimatePoints } from "../engine/structure";
import { claimMetric, combineScores, semanticMetric, structuralMetric, textualMetric } from "../engine/scoring";
import { detectOutliers, robustHighOutliers } from "../engine/outliers";
import { summarizePairs } from "../engine/pairs";
import { ruleBasedFlags } from "../engine/native";
import { sanitizeWeights, validateAnalysisRequest, validateProviderConfig, validateResponses, ValidationError } from "../engine/validation";
import { DEFAULT_WEIGHTS, LIMITS } from "../engine/types";
import type { ClaimRelation, ResponseInput } from "../engine/types";

const R = (texts: string[]): ResponseInput[] => texts.map((t, i) => ({ id: `r${i + 1}`, label: `R${i + 1}`, text: t }));

describe("text utilities", () => {
  it("normalises case, accents and markdown", () => {
    expect(normalizeText("  **Café**   Ünder  ")).toBe("cafe under");
  });
  it("tokenises without punctuation and keeps decimals", () => {
    expect(tokenize("Canberra's population is 3.5 million!")).toEqual(["canberra", "population", "is", "3.5", "million"]);
  });
  it("removes stopwords for content tokens", () => {
    expect(contentTokens("The capital of Australia is Canberra")).toEqual(["capital", "australia", "canberra"]);
  });
  it("segments sentences, respecting abbreviations and list items", () => {
    expect(splitSentences("Dr. Smith went home. He slept.")).toHaveLength(2);
    expect(splitSentences("Three advantages:\n1. Less pollution.\n2. Cheaper.")).toHaveLength(3);
  });
  it("counts words", () => expect(countWords("It's a well-known fact.")).toBe(4));
});

describe("similarity", () => {
  it("cosine is 1 for identical vectors, 0 for orthogonal / zero", () => {
    expect(cosine([1, 2], [1, 2])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
    expect(() => cosine([1], [1, 2])).toThrow();
  });
  it("TF-IDF similarity ranks overlapping text higher", () => {
    const m = textualSimilarity(["a", "b", "c"], ["canberra capital australia", "canberra capital city australia", "bananas grow tropical"]);
    expect(m.values[0][1]).toBeGreaterThan(0.7);
    expect(m.values[0][2]).toBe(0);
    expect(m.values[0][0]).toBeCloseTo(1);
    expect(m.values[1][0]).toBeCloseTo(m.values[0][1]); // symmetric
  });
  it("tfidf handles empty documents without NaN", () => {
    const v = tfidfVectors(["", "the of"]);
    expect(v.flat().every((x) => Number.isFinite(x))).toBe(true);
  });
  it("pairValues returns n(n-1)/2 values; semantic matrix clamps negatives", () => {
    const m = semanticSimilarity(["a", "b", "c"], [[1, 0], [-1, 0], [0, 1]]);
    expect(pairValues(m)).toHaveLength(3);
    expect(m.values[0][1]).toBe(0);
  });
});

describe("structure analysis", () => {
  it("detects requested element counts and sentence ranges", () => {
    expect(detectRequestedElements("Explain three major advantages of renewable energy.")).toMatchObject({ count: 3, noun: "advantages" });
    expect(detectRequestedElements("List 5 reasons.")).toMatchObject({ count: 5 });
    expect(detectRequestedElements("Answer in 2–3 sentences.").sentenceRange).toEqual([2, 3]);
    expect(detectRequestedElements("What is the capital?").count).toBeNull();
  });
  it("estimates points from enumerations and lists", () => {
    expect(estimatePoints("It reduces pollution, decreases fossil fuel use and is sustainable.", 0)).toBe(3);
    expect(estimatePoints("It includes cost, safety and speed.", 0)).toBe(3);
    expect(estimatePoints("x\n1. a\n2. b", 2)).toBe(2);
  });
  it("flags missing requested items and format differences", () => {
    const a = analyzeStructure("Explain three advantages.", R([
      "It cuts pollution, reduces fuel use and lasts long.",
      "1. Less pollution\n2. Less fuel\n3. Lasts long",
      "It is good.",
    ]));
    expect(a.profiles[1].hasNumberedList).toBe(true);
    expect(a.findings.some((f) => f.responseId === "r3" && f.severity === "warning")).toBe(true);
    expect(a.findings.some((f) => f.responseId === "r1" && f.severity === "warning")).toBe(false);
    expect(a.findings.some((f) => f.responseId === "*")).toBe(true);
    expect(a.score).toBeGreaterThan(0);
    expect(a.score).toBeLessThan(1);
  });
  it("identical structure scores 1", () => {
    const a = analyzeStructure("Q?", R(["One two three. Four five six.", "One two three. Four five six."]));
    expect(a.score).toBe(1);
  });
});

describe("scoring methodology", () => {
  const avail = (v: number) => ({ value: v, status: "available" as const, method: "" });
  const na = { value: null, status: "unavailable" as const, reason: "x", method: "" };
  it("weights are applied and normalised", () => {
    const s = combineScores({ textual: avail(1), semantic: avail(0), claim: avail(0.5), structural: avail(1) }, DEFAULT_WEIGHTS);
    // .2*1 + .3*0 + .35*.5 + .15*1 = 0.525
    expect(s.overall.value).toBeCloseTo(0.525, 4);
    expect(s.overall.completeness).toBe("complete");
  });
  it("unavailable metrics are excluded, not zero, and flagged partial", () => {
    const s = combineScores({ textual: avail(0.8), semantic: na, claim: na, structural: avail(0.6) });
    // (.2*.8 + .15*.6) / .35
    expect(s.overall.value).toBeCloseTo((0.16 + 0.09) / 0.35, 3);
    expect(s.overall.completeness).toBe("partial");
    expect(s.overall.missing).toEqual(["semantic", "claim"]);
    expect(Object.values(s.overall.weightsApplied).reduce((a, b) => a + (b ?? 0), 0)).toBeCloseTo(1, 3);
  });
  it("returns unavailable when nothing can be scored", () => {
    const s = combineScores({ textual: na, semantic: na, claim: na, structural: na });
    expect(s.overall.value).toBeNull();
    expect(s.overall.completeness).toBe("unavailable");
  });
  it("custom weights change the result", () => {
    const parts = { textual: avail(1), semantic: avail(0), claim: avail(0), structural: avail(0) };
    expect(combineScores(parts, { textual: 1, semantic: 0, claim: 0, structural: 0 }).overall.value).toBe(1);
  });
  it("metric helpers mark missing inputs unavailable", () => {
    expect(semanticMetric(null, "no model").status).toBe("unavailable");
    expect(claimMetric(null).status).toBe("unavailable");
    expect(claimMetric([{ responseAId: "a", responseBId: "b", agreement: 0, partial: 0, contradiction: 0, other: 2, agreementScore: null, verdict: "no_decisive_evidence" }]).status).toBe("unavailable");
    expect(textualMetric(null).status).toBe("unavailable");
    expect(structuralMetric({ profiles: [], requested: { count: null, noun: null, sentenceRange: null }, findings: [], score: null }).status).toBe("unavailable");
  });
  it("sanitises weights", () => {
    expect(sanitizeWeights({ textual: -1, semantic: "x", claim: 2 })).toEqual({ ...DEFAULT_WEIGHTS, claim: 2 });
    expect(sanitizeWeights({ textual: 0, semantic: 0, claim: 0, structural: 0 })).toEqual(DEFAULT_WEIGHTS);
    expect(sanitizeWeights(null)).toEqual(DEFAULT_WEIGHTS);
  });
});

describe("pair summaries & outliers", () => {
  const rel = (a: string, b: string, relation: ClaimRelation["relation"]): ClaimRelation => ({
    claimAId: `c${a}`, claimBId: `c${b}`, responseAId: a, responseBId: b, relation, explanation: "", confidence: null, source: "llm",
  });
  it("summarises relations and ignores non-decisive ones in the score", () => {
    const rs = R(["a", "b", "c"]);
    const p = summarizePairs(rs, [rel("r1", "r2", "agreement"), rel("r1", "r2", "partial_agreement"), rel("r1", "r3", "contradiction"), rel("r2", "r3", "additional_information")]);
    expect(p).toHaveLength(3);
    expect(p[0].agreementScore).toBeCloseTo(0.75);
    expect(p[0].verdict).toBe("agreement");
    expect(p[1].verdict).toBe("contradiction");
    expect(p[1].agreementScore).toBe(0);
    expect(p[2].agreementScore).toBeNull();
    expect(p[2].verdict).toBe("no_decisive_evidence");
  });
  it("robust outlier test needs 3+ values and a minimum gap", () => {
    expect(robustHighOutliers([0.1, 0.9], 0.1)).toEqual([false, false]);
    expect(robustHighOutliers([0.2, 0.21, 0.19, 0.8], 0.1)).toEqual([false, false, false, true]);
    expect(robustHighOutliers([0.2, 0.21, 0.19, 0.22], 0.1)).toEqual([false, false, false, false]);
  });
  it("detectOutliers explains why, and is not applicable for two responses", () => {
    const rs = R(["a", "b", "c", "d"]);
    const ids = rs.map((r) => r.id);
    const sem = semanticSimilarity(ids, [[1, 0], [0.99, 0.1], [0.98, 0.15], [0, 1]]);
    const out = detectOutliers({ responses: rs, textual: null, semantic: sem, structure: analyzeStructure("Q", rs), pairs: null });
    expect(out.applicable).toBe(true);
    expect(out.results.filter((r) => r.isOutlier).map((r) => r.responseId)).toEqual(["r4"]);
    expect(out.results[3].reasons[0]).toMatch(/Semantically far/);
    const two = detectOutliers({ responses: R(["a", "b"]), textual: null, semantic: null, structure: analyzeStructure("Q", R(["a", "b"])), pairs: null });
    expect(two.applicable).toBe(false);
  });
});

describe("rule-based flags (native mode)", () => {
  it("flags differing entities, numbers and negation but not paraphrases", () => {
    const rs = R([
      "Canberra is the capital of Australia.",
      "Sydney is the capital of Australia.",
      "Canberra is Australia's capital city.",
    ]);
    const f = ruleBasedFlags(rs);
    expect(f.some((x) => x.responseAId === "r1" && x.responseBId === "r2" && x.kind === "differing_entity")).toBe(true);
    expect(f.some((x) => x.responseAId === "r1" && x.responseBId === "r3")).toBe(false);
    const n = ruleBasedFlags(R(["The treatment takes 12 weeks to complete fully.", "The treatment takes 6 weeks to complete fully."]));
    expect(n[0]?.kind).toBe("numeric_mismatch");
    const neg = ruleBasedFlags(R(["Exercise is necessary for good health outcomes.", "Exercise is not necessary for good health outcomes."]));
    expect(neg[0]?.kind).toBe("negation_mismatch");
  });
});

describe("request validation", () => {
  const ok = [{ id: "a", label: "A", text: "hello world" }, { id: "b", label: "B", text: "goodbye world" }];
  it("accepts valid input", () => expect(validateResponses("Q?", ok)).toEqual([]));
  it("rejects empty question, empty response, too few / many", () => {
    expect(validateResponses("", ok)[0]).toMatch(/question/i);
    expect(validateResponses("Q", [ok[0], { ...ok[1], text: "  " }]).join()).toMatch(/empty/);
    expect(validateResponses("Q", [ok[0]]).join()).toMatch(/at least 2/);
    const many = Array.from({ length: 11 }, (_, i) => ({ id: `i${i}`, label: `L${i}`, text: `text ${i}` }));
    expect(validateResponses("Q", many).join()).toMatch(/At most 10/);
  });
  it("rejects duplicates, repeated ids, long input and bad structure", () => {
    expect(validateResponses("Q", [ok[0], { id: "z", label: "Z", text: "Hello   WORLD" }]).join()).toMatch(/duplicates/);
    expect(validateResponses("Q", [ok[0], { ...ok[1], id: "a" }]).join()).toMatch(/reuses id/);
    expect(validateResponses("Q", [ok[0], { ...ok[1], text: "x".repeat(LIMITS.maxResponseChars + 1) }]).join()).toMatch(/too long/);
    expect(validateResponses("Q", [ok[0], 5]).join()).toMatch(/invalid structure/);
    expect(validateResponses("Q", "nope").join()).toMatch(/list/);
  });
  it("validateAnalysisRequest trims, normalises and requires a mode", () => {
    const r = validateAnalysisRequest({ question: " Q ", responses: ok, mode: "native" });
    expect(r.question).toBe("Q");
    expect(() => validateAnalysisRequest({ question: "Q", responses: ok })).toThrow(ValidationError);
    expect(() => validateAnalysisRequest(null)).toThrow(ValidationError);
  });
  it("validates provider configuration", () => {
    expect(validateProviderConfig({ provider: "groq", apiKey: "gsk_abcdefgh", model: "llama-3.3-70b-versatile" }, { allowOllama: false }).provider).toBe("groq");
    expect(() => validateProviderConfig({ provider: "groq", apiKey: "short", model: "m" }, { allowOllama: false })).toThrow(ValidationError);
    expect(() => validateProviderConfig({ provider: "ollama", model: "llama3" }, { allowOllama: false })).toThrow(/cannot be called through the server/);
    expect(() => validateProviderConfig({ provider: "gemini", apiKey: "abcdefghij", model: "bad model!" }, { allowOllama: false })).toThrow(ValidationError);
    expect(validateProviderConfig({ provider: "ollama", model: "llama3:8b" }, { allowOllama: true }).apiKey).toBeUndefined();
  });
});
