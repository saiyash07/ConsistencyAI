import { ProviderError } from "./types";

export interface RequestOptions {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  fetchImpl: typeof fetch;
  signal?: AbortSignal;
  /** Secrets to scrub from any error text. */
  secrets?: string[];
}

/** Remove secrets from text destined for logs or error messages. */
export function redact(text: string, secrets: string[] = []): string {
  let out = text;
  for (const s of secrets) if (s && s.length >= 6) out = out.split(s).join("[redacted]");
  return out;
}

function statusToCode(status: number): ProviderError["code"] {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "model_not_found";
  if (status === 429) return "rate_limit";
  if (status === 400 || status === 422) return "bad_request";
  if (status >= 500) return "unavailable";
  return "bad_response";
}

/** JSON request with timeout, status mapping and secret redaction. */
export async function requestJson<T = unknown>(o: RequestOptions): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), o.timeoutMs);
  const onAbort = () => controller.abort("caller");
  o.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    let res: Response;
    try {
      res = await o.fetchImpl(o.url, {
        method: o.method ?? "POST",
        headers: { "Content-Type": "application/json", ...o.headers },
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
        signal: controller.signal,
      });
    } catch (e) {
      if (controller.signal.aborted && controller.signal.reason === "timeout")
        throw new ProviderError("timeout", `The provider did not respond within ${Math.round(o.timeoutMs / 1000)}s.`);
      if (controller.signal.aborted) throw new ProviderError("network", "The request was cancelled.");
      throw new ProviderError("network", redact(`Could not reach the provider: ${(e as Error).message}`, o.secrets));
    }
    const raw = await res.text();
    if (!res.ok) {
      let detail = "";
      try {
        const j = JSON.parse(raw);
        detail = j?.error?.message ?? j?.error ?? j?.message ?? "";
        if (typeof detail !== "string") detail = JSON.stringify(detail);
      } catch {
        detail = raw.slice(0, 200);
      }
      const code = statusToCode(res.status);
      const prefix =
        code === "auth" ? "Authentication failed (check the API key)"
        : code === "rate_limit" ? "Rate limit reached"
        : code === "model_not_found" ? "Model or endpoint not found"
        : `Provider returned HTTP ${res.status}`;
      throw new ProviderError(code, redact(`${prefix}${detail ? `: ${detail.slice(0, 240)}` : ""}`, o.secrets), res.status);
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new ProviderError("bad_response", "The provider returned a non-JSON response.");
    }
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener("abort", onAbort);
  }
}
