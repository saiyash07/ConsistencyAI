import { runAnalysis } from "../../engine/pipeline";
import { createProvider, ProviderError } from "../../engine/providers";
import type { AnalysisRequest, AnalysisResult, ProviderConfig, ProviderId } from "../../engine/types";
import { validateAnalysisRequest } from "../../engine/validation";

export interface ConnectionInfo {
  models: string[];
  supportsEmbeddings: boolean;
  /** Suggested chat model / embedding model (Ollama). */
  suggestedModel?: string;
  suggestedEmbeddingModel?: string;
}

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  } catch {
    throw new Error("Could not reach the Consistency AI server. Check your connection, or use Native analysis, which runs entirely in your browser.");
  }
  const text = await res.text();
  let json: { error?: { message?: string; issues?: string[] } } & Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const e = json.error;
    const detail = e?.issues?.length ? ` ${e.issues.join(" ")}` : "";
    throw new Error(e?.message ? `${e.message}${detail}` : `Server error (HTTP ${res.status}).`);
  }
  return json as T;
}

/** Gemini/Groq go through the backend; Ollama is called directly from the browser. */
export async function testConnection(cfg: ProviderConfig): Promise<ConnectionInfo> {
  if (cfg.provider === "ollama") {
    const p = createProvider({ ...cfg, model: cfg.model || "unused" });
    const models = await p.listModels();
    const embed = models.find((m) => /embed/i.test(m));
    const chat = models.find((m) => !/embed/i.test(m));
    return { models, supportsEmbeddings: Boolean(embed), suggestedModel: chat, suggestedEmbeddingModel: embed };
  }
  const r = await post<{ models: string[]; supportsEmbeddings: boolean }>("/api/test-connection", { provider: cfg });
  return { models: r.models, supportsEmbeddings: r.supportsEmbeddings };
}

/** Run one analysis. `cfg === null` means native mode (runs locally in the browser). */
export async function analyze(
  request: AnalysisRequest,
  cfg: ProviderConfig | null,
  onProgress?: (m: string) => void,
  signal?: AbortSignal
): Promise<AnalysisResult> {
  if (request.mode === "native" || !cfg) {
    const valid = validateAnalysisRequest({ ...request, mode: "native" });
    return runAnalysis(valid, { onProgress });
  }
  if (cfg.provider === "ollama") {
    const valid = validateAnalysisRequest(request);
    return runAnalysis(valid, { provider: createProvider(cfg), onProgress, signal, concurrency: 1 });
  }
  onProgress?.(`Sending to ${cfg.provider} via the Consistency AI server…`);
  const r = await post<{ result: AnalysisResult }>("/api/analyze", { request, provider: cfg }, signal);
  return r.result;
}

export function describeError(e: unknown): string {
  if (e instanceof ProviderError || e instanceof Error) return e.message;
  return "Something went wrong.";
}

export const PROVIDER_LABEL: Record<ProviderId, string> = { gemini: "Google Gemini", groq: "Groq", ollama: "Ollama (local)" };
