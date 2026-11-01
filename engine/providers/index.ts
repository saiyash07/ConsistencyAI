import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { OllamaProvider, OLLAMA_DEFAULT_EMBEDDING_MODEL } from "./ollama";
import { ProviderError } from "./types";
import type { AIProvider, ProviderRuntime } from "./types";
import type { ProviderConfig } from "../types";

export * from "./types";
export { GeminiProvider, GroqProvider, OllamaProvider, OLLAMA_DEFAULT_EMBEDDING_MODEL };

/** Factory – the only place that knows which concrete adapters exist. */
export function createProvider(cfg: ProviderConfig, rt: ProviderRuntime = {}): AIProvider {
  switch (cfg.provider) {
    case "gemini":
      if (!cfg.apiKey) throw new ProviderError("auth", "A Gemini API key is required.");
      return new GeminiProvider(cfg.apiKey, cfg.model, rt);
    case "groq":
      if (!cfg.apiKey) throw new ProviderError("auth", "A Groq API key is required.");
      return new GroqProvider(cfg.apiKey, cfg.model, rt);
    case "ollama":
      return new OllamaProvider(cfg.baseUrl, cfg.model, cfg.embeddingModel, rt);
    default:
      throw new ProviderError("bad_request", "Unknown provider.");
  }
}
