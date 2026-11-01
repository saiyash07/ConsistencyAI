import { requestJson } from "./http";
import { ProviderError } from "./types";
import type { AIProvider, GenerateOptions, ProviderRuntime } from "./types";

export const OLLAMA_DEFAULT_URL = "http://localhost:11434";
export const OLLAMA_DEFAULT_EMBEDDING_MODEL = "nomic-embed-text";

/** Accepts only http(s) URLs and strips trailing slashes. */
export function normalizeOllamaUrl(input: string | undefined): string {
  const raw = (input?.trim() || OLLAMA_DEFAULT_URL).replace(/\/+$/, "");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ProviderError("bad_request", "The Ollama address is not a valid URL (example: http://localhost:11434).");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:")
    throw new ProviderError("bad_request", "The Ollama address must start with http:// or https://.");
  return u.origin;
}

/**
 * Ollama adapter. It MUST run in the user's browser (or another process on the
 * same machine): a serverless backend cannot reach the user's localhost.
 */
export class OllamaProvider implements AIProvider {
  readonly id = "ollama" as const;
  readonly supportsEmbeddings: boolean;
  private base: string;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;

  constructor(
    baseUrl: string | undefined,
    readonly model: string,
    private embeddingModel?: string,
    rt: ProviderRuntime = {}
  ) {
    this.base = normalizeOllamaUrl(baseUrl);
    this.fetchImpl = rt.fetchImpl ?? ((...a) => fetch(...a));
    // Local models are slower; allow a longer default.
    this.timeoutMs = rt.timeoutMs ?? 120000;
    this.supportsEmbeddings = Boolean(embeddingModel);
  }

  async generate(o: GenerateOptions): Promise<string> {
    const data = await requestJson<{ message?: { content?: string } }>({
      url: `${this.base}/api/chat`,
      body: {
        model: this.model,
        stream: false,
        ...(o.json ? { format: "json" } : {}),
        options: { temperature: o.temperature ?? 0 },
        messages: [
          { role: "system", content: o.system },
          { role: "user", content: o.prompt },
        ],
      },
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      signal: o.signal,
    }).catch(explainNetwork);
    const text = data.message?.content ?? "";
    if (!text.trim()) throw new ProviderError("bad_response", "Ollama returned an empty response.");
    return text;
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<number[][]> {
    if (!this.embeddingModel)
      throw new ProviderError("unavailable", "No Ollama embedding model selected (try: ollama pull nomic-embed-text).");
    const data = await requestJson<{ embeddings?: number[][] }>({
      url: `${this.base}/api/embed`,
      body: { model: this.embeddingModel, input: texts },
      timeoutMs: this.timeoutMs,
      fetchImpl: this.fetchImpl,
      signal,
    }).catch(explainNetwork);
    if (!data.embeddings || data.embeddings.length !== texts.length)
      throw new ProviderError("bad_response", "Ollama returned malformed embeddings.");
    return data.embeddings;
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    const data = await requestJson<{ models?: Array<{ name: string }> }>({
      url: `${this.base}/api/tags`,
      method: "GET",
      timeoutMs: Math.min(this.timeoutMs, 10000),
      fetchImpl: this.fetchImpl,
      signal,
    }).catch(explainNetwork);
    return (data.models ?? []).map((m) => m.name);
  }
}

function explainNetwork(e: unknown): never {
  if (e instanceof ProviderError && e.code === "network")
    throw new ProviderError(
      "network",
      "Could not reach Ollama. Check that it is running and that browser access is allowed: start it with OLLAMA_ORIGINS set to this site's origin (see Settings → Ollama setup). Safari blocks http://localhost calls from https pages; use Chrome, Edge or Firefox."
    );
  if (e instanceof ProviderError && e.code === "model_not_found")
    throw new ProviderError("model_not_found", "Ollama does not have that model installed. Run `ollama pull <model>` first.", e.status);
  throw e;
}
