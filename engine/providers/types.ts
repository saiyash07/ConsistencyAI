export type ProviderErrorCode =
  | "auth"
  | "rate_limit"
  | "timeout"
  | "network"
  | "model_not_found"
  | "bad_response"
  | "bad_request"
  | "unavailable";

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface GenerateOptions {
  system: string;
  prompt: string;
  /** Request JSON-only output. */
  json?: boolean;
  temperature?: number;
  signal?: AbortSignal;
}

/** Common contract every provider adapter implements. */
export interface AIProvider {
  readonly id: "gemini" | "groq" | "ollama";
  readonly model: string;
  /** Whether this provider can produce embeddings at all. */
  readonly supportsEmbeddings: boolean;
  generate(opts: GenerateOptions): Promise<string>;
  /** Throws ProviderError (code "unavailable") when no embedding model is configured. */
  embed(texts: string[], signal?: AbortSignal): Promise<number[][]>;
  /** Verify credentials/connectivity and list usable models. */
  listModels(signal?: AbortSignal): Promise<string[]>;
}

export interface ProviderRuntime {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}
