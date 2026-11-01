import { runAnalysis } from "../../engine/pipeline";
import { createProvider, ProviderError } from "../../engine/providers";
import { redact } from "../../engine/providers/http";
import type { ProviderRuntime } from "../../engine/providers";
import { ValidationError, validateAnalysisRequest, validateProviderConfig } from "../../engine/validation";
import type { AnalysisResult } from "../../engine/types";

export interface ApiReply {
  status: number;
  body: unknown;
}

const STATUS_BY_CODE: Record<string, number> = {
  auth: 401,
  rate_limit: 429,
  timeout: 504,
  network: 502,
  unavailable: 502,
  model_not_found: 404,
  bad_response: 502,
  bad_request: 400,
};

/** Convert any thrown value into a safe reply. Never includes request bodies or keys. */
export function toErrorReply(e: unknown, secrets: string[] = []): ApiReply {
  if (e instanceof ValidationError) return { status: 400, body: { error: { code: "validation", message: "Invalid request.", issues: e.issues } } };
  if (e instanceof ProviderError)
    return { status: STATUS_BY_CODE[e.code] ?? 502, body: { error: { code: e.code, message: redact(e.message, secrets) } } };
  return { status: 500, body: { error: { code: "internal", message: "Unexpected server error." } } };
}

function getSecrets(body: unknown): string[] {
  const k = (body as { provider?: { apiKey?: unknown } } | null)?.provider?.apiKey;
  return typeof k === "string" ? [k] : [];
}

/** POST /api/analyze */
export async function handleAnalyze(body: unknown, rt: ProviderRuntime = {}): Promise<ApiReply> {
  try {
    const request = validateAnalysisRequest((body as { request?: unknown } | null)?.request);
    if (request.mode === "native") {
      const result: AnalysisResult = await runAnalysis(request);
      return { status: 200, body: { result } };
    }
    const cfg = validateProviderConfig((body as { provider?: unknown } | null)?.provider, { allowOllama: false });
    const provider = createProvider(cfg, rt);
    const result = await runAnalysis(request, { provider });
    return { status: 200, body: { result } };
  } catch (e) {
    return toErrorReply(e, getSecrets(body));
  }
}

/** POST /api/test-connection – verifies the key and lists models. */
export async function handleTestConnection(body: unknown, rt: ProviderRuntime = {}): Promise<ApiReply> {
  try {
    const cfg = validateProviderConfig((body as { provider?: unknown } | null)?.provider, { allowOllama: false });
    const provider = createProvider(cfg, rt);
    const models = await provider.listModels();
    return { status: 200, body: { ok: true, models, supportsEmbeddings: provider.supportsEmbeddings } };
  } catch (e) {
    return toErrorReply(e, getSecrets(body));
  }
}

/** Best-effort per-instance rate limiter (serverless instances do not share memory). */
const hits = new Map<string, number[]>();
export function rateLimited(ip: string, limitPerMinute: number, now = Date.now()): boolean {
  const windowStart = now - 60_000;
  const recent = (hits.get(ip) ?? []).filter((t) => t > windowStart);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const k of hits.keys()) { hits.delete(k); break; }
  return recent.length > limitPerMinute;
}
