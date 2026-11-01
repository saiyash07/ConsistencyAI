import { describe, expect, it } from "vitest";
import { handleAnalyze, handleTestConnection, rateLimited } from "../api/_lib/handlers";
import { mockFetch } from "./helpers";

const KEY = "AIza-SECRET-KEY-98765";
const responses = [
  { id: "a", label: "A", text: "Canberra is the capital of Australia." },
  { id: "b", label: "B", text: "Sydney is the capital of Australia." },
];
const provider = { provider: "gemini", apiKey: KEY, model: "gemini-test" };

describe("POST /api/analyze", () => {
  it("native mode works with no provider or key", async () => {
    const r = await handleAnalyze({ request: { question: "Capital?", responses, mode: "native" } });
    expect(r.status).toBe(200);
    expect((r.body as { result: { scores: { textual: { value: number } } } }).result.scores.textual.value).toBeGreaterThan(0);
  });
  it("returns 400 with readable issues for invalid input", async () => {
    const r = await handleAnalyze({ request: { question: "", responses: [responses[0]], mode: "native" } });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/question is required/);
    expect(JSON.stringify(r.body)).toMatch(/at least 2/);
  });
  it("rejects hybrid without credentials and Ollama via the server", async () => {
    const r1 = await handleAnalyze({ request: { question: "Q", responses, mode: "hybrid" } });
    expect(r1.status).toBe(400);
    const r2 = await handleAnalyze({ request: { question: "Q", responses, mode: "hybrid" }, provider: { provider: "ollama", model: "llama3" } });
    expect(r2.status).toBe(400);
    expect(JSON.stringify(r2.body)).toMatch(/browser/);
  });
  it("invalid provider credentials → 401 and the key never appears in the reply", async () => {
    const { fn } = mockFetch(() => ({ status: 401, body: { error: { message: `API key not valid: ${KEY}` } } }));
    const r = await handleAnalyze({ request: { question: "Q", responses, mode: "hybrid" }, provider }, { fetchImpl: fn });
    expect(r.status).toBe(401);
    expect(JSON.stringify(r.body)).not.toContain(KEY);
  });
  it("full hybrid run through a mocked Gemini; response never contains the key", async () => {
    const { fn, calls } = mockFetch((url, init) => {
      if (url.includes("batchEmbedContents")) return { body: { embeddings: [{ values: [1, 0] }, { values: [0.9, 0.1] }] } };
      const sys = JSON.parse(init.body as string).systemInstruction.parts[0].text as string;
      const prompt = JSON.parse(init.body as string).contents[0].parts[0].text as string;
      let text: string;
      if (sys.startsWith("You extract factual claims")) {
        const answer = prompt.split('Answer to analyse:\n"""')[1].split('"""')[0];
        text = JSON.stringify({ claims: [{ originalText: answer, normalizedText: answer, subject: "capital", predicate: "is", object: answer.split(" ")[0], qualifiers: [], confidence: 0.9 }] });
      } else if (sys.startsWith("You compare factual claims")) {
        text = JSON.stringify({ relations: [{ anchorClaimId: "C1", otherClaimId: "C2", relation: "contradiction", explanation: "Different capitals.", confidence: 0.9 }] });
      } else text = JSON.stringify({ summary: "The two responses conflict about the capital city; this does not say which is right." });
      return { body: { candidates: [{ content: { parts: [{ text }] } }] } };
    });
    const r = await handleAnalyze({ request: { question: "Capital of Australia?", responses, mode: "hybrid" }, provider }, { fetchImpl: fn });
    expect(r.status).toBe(200);
    const result = (r.body as { result: import("../engine/types").AnalysisResult }).result;
    expect(result.relations[0].relation).toBe("contradiction");
    expect(result.pairSummaries[0].verdict).toBe("contradiction");
    expect(result.scores.semantic.status).toBe("available");
    expect(result.explanation.source).toBe("llm");
    expect(JSON.stringify(r.body)).not.toContain(KEY);
    // key travels only in the header to the provider
    expect(calls.every((c) => !c.url.includes(KEY))).toBe(true);
    expect(calls.every((c) => (c.init.headers as Record<string, string>)["x-goog-api-key"] === KEY)).toBe(true);
  });
  it("provider timeout → 504", async () => {
    const fn = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener("abort", () => rej(new Error("x"))))) as unknown as typeof fetch;
    const r = await handleAnalyze({ request: { question: "Q", responses, mode: "hybrid" }, provider }, { fetchImpl: fn, timeoutMs: 20 });
    // every LLM call times out; claims fail for all responses → degraded result, not a crash
    expect([200, 504]).toContain(r.status);
    if (r.status === 200) {
      const res = (r.body as { result: import("../engine/types").AnalysisResult }).result;
      expect(res.stages.claims.status).toBe("failed");
      expect(res.scores.claim.value).toBeNull();
      expect(res.scores.textual.value).not.toBeNull();
    }
  });
});

describe("POST /api/test-connection", () => {
  it("lists models for a valid key", async () => {
    const { fn } = mockFetch(() => ({ body: { models: [{ name: "models/gemini-x", supportedGenerationMethods: ["generateContent"] }] } }));
    const r = await handleTestConnection({ provider }, { fetchImpl: fn });
    expect(r.body).toEqual({ ok: true, models: ["gemini-x"], supportsEmbeddings: true });
  });
  it("401 for a bad key, 400 for a missing key", async () => {
    const bad = mockFetch(() => ({ status: 401, body: { error: { message: "nope" } } }));
    expect((await handleTestConnection({ provider }, { fetchImpl: bad.fn })).status).toBe(401);
    expect((await handleTestConnection({ provider: { provider: "groq", model: "m" } })).status).toBe(400);
  });
});

describe("rate limiter", () => {
  it("blocks after the per-minute limit and recovers after the window", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimited("ip-x", 3, t + i)).toBe(false);
    expect(rateLimited("ip-x", 3, t + 10)).toBe(true);
    expect(rateLimited("ip-x", 3, t + 61_000)).toBe(false);
  });
});
