import { describe, expect, it } from "vitest";
import { GeminiProvider } from "../engine/providers/gemini";
import { GroqProvider } from "../engine/providers/groq";
import { OllamaProvider, normalizeOllamaUrl } from "../engine/providers/ollama";
import { createProvider, ProviderError } from "../engine/providers";
import { redact } from "../engine/providers/http";
import { mockFetch } from "./helpers";

const KEY = "SECRET-KEY-123456";

describe("GeminiProvider", () => {
  it("sends the key in a header (not the URL) and parses text", async () => {
    const { fn, calls } = mockFetch(() => ({ body: { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] } }));
    const p = new GeminiProvider(KEY, "gemini-test", { fetchImpl: fn });
    expect(await p.generate({ system: "s", prompt: "p", json: true })).toBe('{"ok":true}');
    expect(calls[0].url).not.toContain(KEY);
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    expect(JSON.parse(calls[0].init.body as string).generationConfig.responseMimeType).toBe("application/json");
  });
  it("maps 401/429/404 to typed errors and never leaks the key", async () => {
    for (const [status, code] of [[401, "auth"], [403, "auth"], [429, "rate_limit"], [404, "model_not_found"], [503, "unavailable"]] as const) {
      const { fn } = mockFetch(() => ({ status, body: { error: { message: `bad key ${KEY}` } } }));
      const p = new GeminiProvider(KEY, "m", { fetchImpl: fn });
      const err = await p.generate({ system: "s", prompt: "p" }).catch((e) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect(err.code).toBe(code);
      expect(err.message).not.toContain(KEY);
    }
  });
  it("reports blocked and empty responses", async () => {
    const blocked = new GeminiProvider(KEY, "m", { fetchImpl: mockFetch(() => ({ body: { promptFeedback: { blockReason: "SAFETY" } } })).fn });
    await expect(blocked.generate({ system: "s", prompt: "p" })).rejects.toThrow(/blocked/);
    const empty = new GeminiProvider(KEY, "m", { fetchImpl: mockFetch(() => ({ body: { candidates: [] } })).fn });
    await expect(empty.generate({ system: "s", prompt: "p" })).rejects.toThrow(/empty/);
  });
  it("embeds a batch and validates the shape", async () => {
    const good = new GeminiProvider(KEY, "m", { fetchImpl: mockFetch(() => ({ body: { embeddings: [{ values: [1, 2] }, { values: [3, 4] }] } })).fn });
    expect(await good.embed(["a", "b"])).toEqual([[1, 2], [3, 4]]);
    const bad = new GeminiProvider(KEY, "m", { fetchImpl: mockFetch(() => ({ body: { embeddings: [{ values: [1] }] } })).fn });
    await expect(bad.embed(["a", "b"])).rejects.toThrow(/malformed/);
  });
  it("lists only generateContent gemini models", async () => {
    const p = new GeminiProvider(KEY, "m", { fetchImpl: mockFetch(() => ({ body: { models: [
      { name: "models/gemini-a", supportedGenerationMethods: ["generateContent"] },
      { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
    ] } })).fn });
    expect(await p.listModels()).toEqual(["gemini-a"]);
  });
  it("times out", async () => {
    const fn = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
    const p = new GeminiProvider(KEY, "m", { fetchImpl: fn, timeoutMs: 20 });
    await expect(p.generate({ system: "s", prompt: "p" })).rejects.toMatchObject({ code: "timeout" });
  });
  it("maps network failures without leaking the key", async () => {
    const fn = (async () => { throw new Error(`connect failed for ${KEY}`); }) as unknown as typeof fetch;
    const err = await new GeminiProvider(KEY, "m", { fetchImpl: fn }).generate({ system: "s", prompt: "p" }).catch((e) => e);
    expect(err.code).toBe("network");
    expect(err.message).not.toContain(KEY);
  });
});

describe("GroqProvider", () => {
  it("uses bearer auth and OpenAI-style JSON mode", async () => {
    const { fn, calls } = mockFetch(() => ({ body: { choices: [{ message: { content: "{}" } }] } }));
    const p = new GroqProvider(KEY, "llama", { fetchImpl: fn });
    await p.generate({ system: "s", prompt: "p", json: true });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(calls[0].init.body as string).response_format).toEqual({ type: "json_object" });
  });
  it("has no embeddings and says so", async () => {
    const p = new GroqProvider(KEY, "llama");
    expect(p.supportsEmbeddings).toBe(false);
    await expect(p.embed()).rejects.toMatchObject({ code: "unavailable" });
  });
  it("filters non-chat models and maps auth errors", async () => {
    const ok = new GroqProvider(KEY, "m", { fetchImpl: mockFetch(() => ({ body: { data: [{ id: "llama-3" }, { id: "whisper-large-v3" }, { id: "llama-guard-4" }] } })).fn });
    expect(await ok.listModels()).toEqual(["llama-3"]);
    const bad = new GroqProvider(KEY, "m", { fetchImpl: mockFetch(() => ({ status: 401, body: { error: { message: "Invalid API Key" } } })).fn });
    await expect(bad.listModels()).rejects.toMatchObject({ code: "auth" });
  });
});

describe("OllamaProvider", () => {
  it("normalises and validates addresses", () => {
    expect(normalizeOllamaUrl(undefined)).toBe("http://localhost:11434");
    expect(normalizeOllamaUrl("http://127.0.0.1:11434/")).toBe("http://127.0.0.1:11434");
    expect(() => normalizeOllamaUrl("not a url")).toThrow(ProviderError);
    expect(() => normalizeOllamaUrl("file:///etc/passwd")).toThrow(/http/);
  });
  it("chats with JSON format and lists installed models", async () => {
    const { fn, calls } = mockFetch((url) =>
      url.endsWith("/api/tags") ? { body: { models: [{ name: "llama3:8b" }, { name: "nomic-embed-text:latest" }] } } : { body: { message: { content: '{"a":1}' } } }
    );
    const p = new OllamaProvider(undefined, "llama3:8b", "nomic-embed-text", { fetchImpl: fn });
    expect(await p.listModels()).toEqual(["llama3:8b", "nomic-embed-text:latest"]);
    expect(await p.generate({ system: "s", prompt: "p", json: true })).toBe('{"a":1}');
    expect(JSON.parse(calls[1].init.body as string)).toMatchObject({ format: "json", stream: false, model: "llama3:8b" });
  });
  it("embeds via /api/embed and reports unavailable without an embedding model", async () => {
    const p = new OllamaProvider(undefined, "m", "nomic-embed-text", { fetchImpl: mockFetch(() => ({ body: { embeddings: [[1], [2]] } })).fn });
    expect(await p.embed(["a", "b"])).toEqual([[1], [2]]);
    const none = new OllamaProvider(undefined, "m", undefined);
    expect(none.supportsEmbeddings).toBe(false);
    await expect(none.embed(["a"])).rejects.toMatchObject({ code: "unavailable" });
  });
  it("explains unreachable servers and missing models", async () => {
    const down = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
    await expect(new OllamaProvider(undefined, "m", undefined, { fetchImpl: down }).listModels()).rejects.toThrow(/OLLAMA_ORIGINS/);
    const missing = new OllamaProvider(undefined, "nope", undefined, { fetchImpl: mockFetch(() => ({ status: 404, body: { error: "model 'nope' not found" } })).fn });
    await expect(missing.generate({ system: "s", prompt: "p" })).rejects.toThrow(/ollama pull/);
  });
});

describe("factory & redaction", () => {
  it("creates the right adapters and requires keys", () => {
    expect(createProvider({ provider: "gemini", apiKey: KEY, model: "m" }).id).toBe("gemini");
    expect(createProvider({ provider: "groq", apiKey: KEY, model: "m" }).id).toBe("groq");
    expect(createProvider({ provider: "ollama", model: "m" }).id).toBe("ollama");
    expect(() => createProvider({ provider: "gemini", model: "m" })).toThrow(/API key/);
  });
  it("redact replaces secrets", () => expect(redact(`x ${KEY} y`, [KEY])).toBe("x [redacted] y"));
});
