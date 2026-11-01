import { describe, expect, it } from "vitest";
import { isGrounded, validateClaimPayload } from "../engine/llm/claims";
import { generateValidated, mapLimit, parseJsonLoose } from "../engine/llm/json";
import { makeRelationValidator } from "../engine/llm/relations";
import type { Claim } from "../engine/types";
import type { AIProvider } from "../engine/providers/types";

const claim = (id: string, responseId: string): Claim => ({
  id, responseId, originalText: id, normalizedText: id, subject: "s", predicate: "p", object: null, qualifiers: [], confidence: null, grounded: true,
});

describe("JSON handling", () => {
  it("parses fenced and prose-wrapped JSON", () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('Sure! {"a":2} hope that helps')).toEqual({ a: 2 });
    expect(() => parseJsonLoose("no json")).toThrow(/valid JSON/);
  });
  it("retries once with feedback when output is invalid, then succeeds", async () => {
    const prompts: string[] = [];
    const replies = ["garbage", '{"claims":[]}'];
    const p = { generate: async (o: { prompt: string }) => { prompts.push(o.prompt); return replies.shift()!; } } as unknown as AIProvider;
    const out = await generateValidated(p, "s", "p", validateClaimPayload);
    expect(out).toEqual([]);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toMatch(/previous reply was invalid/);
  });
  it("gives up after the second invalid reply", async () => {
    const p = { generate: async () => "{}" } as unknown as AIProvider;
    await expect(generateValidated(p, "s", "p", validateClaimPayload)).rejects.toMatchObject({ code: "bad_response" });
  });
  it("mapLimit preserves order and bounds concurrency", async () => {
    let active = 0, peak = 0;
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; return n * 2; });
    expect(out).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe("claim extraction schema", () => {
  const good = { originalText: "Canberra is the capital.", normalizedText: "Canberra is Australia's capital.", subject: "Canberra", predicate: "is capital of", object: "Australia", qualifiers: ["since 1913"], confidence: 0.9 };
  it("accepts a valid payload and normalises optional fields", () => {
    const [c] = validateClaimPayload({ claims: [{ ...good, object: "", confidence: 7, qualifiers: "x" }] });
    expect(c.object).toBeNull();
    expect(c.confidence).toBeNull();
    expect(c.qualifiers).toEqual([]);
    expect(validateClaimPayload({ claims: [good] })[0].qualifiers).toEqual(["since 1913"]);
  });
  it("rejects structural problems", () => {
    expect(() => validateClaimPayload({})).toThrow(/claims/);
    expect(() => validateClaimPayload({ claims: [{ ...good, originalText: "" }] })).toThrow(/originalText/);
    expect(() => validateClaimPayload({ claims: [{ ...good, subject: "" }] })).toThrow(/subject/);
    expect(() => validateClaimPayload({ claims: ["x"] })).toThrow();
  });
  it("caps the number of claims per response", () => {
    expect(validateClaimPayload({ claims: Array.from({ length: 30 }, () => good) })).toHaveLength(12);
  });
  it("grounding detects invented claims", () => {
    const text = "Canberra became the capital in 1913. It is a planned city.";
    expect(isGrounded("Canberra became the capital in 1913.", text)).toBe(true);
    expect(isGrounded("canberra became the capital in 1913", text)).toBe(true);
    expect(isGrounded("Sydney hosts the Olympic opera house tours", text)).toBe(false);
  });
});

describe("relation schema", () => {
  const claims = new Map([["C1", claim("C1", "a")], ["C2", claim("C2", "b")]]);
  const v = makeRelationValidator(new Set(["C1"]), new Set(["C2"]), claims);
  it("accepts valid relations and attaches response ids", () => {
    const [r] = v({ relations: [{ anchorClaimId: "C1", otherClaimId: "C2", relation: "contradiction", explanation: "x", confidence: 0.7 }] });
    expect(r).toMatchObject({ responseAId: "a", responseBId: "b", relation: "contradiction", source: "llm" });
  });
  it("drops hallucinated / wrong-side ids and duplicates; rejects unknown labels", () => {
    const rel = { anchorClaimId: "C1", otherClaimId: "C2", relation: "agreement" };
    expect(v({ relations: [rel, rel, { ...rel, otherClaimId: "C9" }, { ...rel, anchorClaimId: "C2", otherClaimId: "C1" }] })).toHaveLength(1);
    expect(() => v({ relations: [{ ...rel, relation: "maybe" }] })).toThrow(/unknown relation/);
    expect(() => v({ nope: [] })).toThrow(/relations/);
  });
});
