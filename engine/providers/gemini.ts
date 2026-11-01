import { requestJson } from "./http";
import { ProviderError } from "./types";
import type { AIProvider, GenerateOptions, ProviderRuntime } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";

interface GenResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
}

export class GeminiProvider implements AIProvider {
  readonly id = "gemini" as const;
  readonly supportsEmbeddings = true;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;

  constructor(private apiKey: string, readonly model: string, rt: ProviderRuntime = {}) {
    this.fetchImpl = rt.fetchImpl ?? fetch;
    this.timeoutMs = rt.timeoutMs ?? 25000;
  }

  /** The key is sent in a header (never in the URL) so it cannot leak into URL logs. */
  private headers() {
    return { "x-goog-api-key": this.apiKey };
  }

  async generate(o: GenerateOptions): Promise<string> {
    const data = await requestJson<GenResponse>({
      url: `${BASE}/models/${encodeURIComponent(this.model)}:generateContent`,
      headers: this.headers(),
      body: {
        systemInstruction: { parts: [{ text: o.system }] },
        contents: [{ role: "user", parts: [{ text: o.prompt }] }],
        generationConfig: {
          temperature: o.temperature ?? 0,
          ...(o.json ? { responseMimeType: "application/json" } : {}),
        },
      },
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      signal: o.signal,
      secrets: [this.apiKey],
    });
    if (data.promptFeedback?.blockReason)
      throw new ProviderError("bad_response", `Gemini blocked the request (${data.promptFeedback.blockReason}).`);
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) throw new ProviderError("bad_response", "Gemini returned an empty response.");
    return text;
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    const data = await requestJson<{ embeddings?: Array<{ values?: number[] }> }>({
      url: `${BASE}/models/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`,
      headers: this.headers(),
      body: {
        requests: texts.map((t) => ({
          model: `models/${GEMINI_EMBEDDING_MODEL}`,
          content: { parts: [{ text: t }] },
          taskType: "SEMANTIC_SIMILARITY",
        })),
      },
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      signal,
      secrets: [this.apiKey],
    });
    const vecs = data.embeddings?.map((e) => e.values ?? []) ?? [];
    if (vecs.length !== texts.length || vecs.some((v) => v.length === 0))
      throw new ProviderError("bad_response", "Gemini returned malformed embeddings.");
    return vecs;
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const data = await requestJson<{ models?: Array<{ name: string; supportedGenerationMethods?: string[] }> }>({
      url: `${BASE}/models?pageSize=200`,
      method: "GET",
      headers: this.headers(),
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      signal,
      secrets: [this.apiKey],
    });
    return (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""))
      .filter((n) => n.startsWith("gemini"));
  }
}
