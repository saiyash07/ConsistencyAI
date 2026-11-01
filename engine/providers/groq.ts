import { requestJson } from "./http";
import { ProviderError } from "./types";
import type { AIProvider, GenerateOptions, ProviderRuntime } from "./types";

const BASE = "https://api.groq.com/openai/v1";
export const GROQ_DEFAULT_MODEL = "llama-3.3-70b-versatile";

export class GroqProvider implements AIProvider {
  readonly id = "groq" as const;
  /** Groq does not offer an embeddings endpoint, so semantic analysis is reported unavailable. */
  readonly supportsEmbeddings = false;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;

  constructor(private apiKey: string, readonly model: string, rt: ProviderRuntime = {}) {
    this.fetchImpl = rt.fetchImpl ?? fetch;
    this.timeoutMs = rt.timeoutMs ?? 25000;
  }

  private headers() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  async generate(o: GenerateOptions): Promise<string> {
    const data = await requestJson<{ choices?: Array<{ message?: { content?: string } }> }>({
      url: `${BASE}/chat/completions`,
      headers: this.headers(),
      body: {
        model: this.model,
        temperature: o.temperature ?? 0,
        messages: [
          { role: "system", content: o.system },
          { role: "user", content: o.prompt },
        ],
        ...(o.json ? { response_format: { type: "json_object" } } : {}),
      },
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      signal: o.signal,
      secrets: [this.apiKey],
    });
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new ProviderError("bad_response", "Groq returned an empty response.");
    return text;
  }

  async embed(): Promise<number[][]> {
    throw new ProviderError("unavailable", "Groq does not provide an embeddings API.");
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const data = await requestJson<{ data?: Array<{ id: string }> }>({
      url: `${BASE}/models`,
      method: "GET",
      headers: this.headers(),
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      signal,
      secrets: [this.apiKey],
    });
    return (data.data ?? [])
      .map((m) => m.id)
      .filter((id) => !/whisper|guard|tts|playai|orpheus|distil-whisper/i.test(id))
      .sort();
  }
}
