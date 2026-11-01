import { DEFAULT_WEIGHTS, LIMITS } from "./types";
import type { AnalysisRequest, ProviderConfig, ProviderId, ResponseInput, ScoreWeights } from "./types";
import { normalizeText } from "./text";

export class ValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join(" "));
    this.name = "ValidationError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validate a list of responses; returns human-readable issues (empty = valid). */
export function validateResponses(question: unknown, responses: unknown): string[] {
  const issues: string[] = [];
  if (typeof question !== "string" || !question.trim()) issues.push("The original question is required.");
  else if (question.length > LIMITS.maxQuestionChars)
    issues.push(`The question is too long (max ${LIMITS.maxQuestionChars} characters).`);

  if (!Array.isArray(responses)) {
    issues.push("Responses must be a list.");
    return issues;
  }
  if (responses.length < LIMITS.minResponses) issues.push(`Add at least ${LIMITS.minResponses} responses.`);
  if (responses.length > LIMITS.maxResponses) issues.push(`At most ${LIMITS.maxResponses} responses are allowed.`);

  const ids = new Set<string>();
  const seen = new Map<string, string>();
  let total = 0;
  responses.slice(0, LIMITS.maxResponses + 1).forEach((r, i) => {
    const n = i + 1;
    if (!isRecord(r)) {
      issues.push(`Response ${n} has an invalid structure.`);
      return;
    }
    const { id, label, text } = r;
    if (typeof id !== "string" || !id.trim() || id.length > 64) issues.push(`Response ${n} needs a valid id.`);
    else if (ids.has(id)) issues.push(`Response ${n} reuses id "${id}".`);
    else ids.add(id);
    if (typeof label !== "string" || !label.trim()) issues.push(`Response ${n} needs a label.`);
    else if (label.length > LIMITS.maxLabelChars) issues.push(`Response ${n}'s label is too long.`);
    if (typeof text !== "string" || !text.trim()) {
      issues.push(`Response ${n} is empty.`);
    } else {
      if (text.length > LIMITS.maxResponseChars)
        issues.push(`Response ${n} is too long (max ${LIMITS.maxResponseChars} characters).`);
      total += text.length;
      const key = normalizeText(text);
      const prev = seen.get(key);
      if (prev) issues.push(`Response ${n} duplicates ${prev}.`);
      else seen.set(key, typeof label === "string" && label ? label : `response ${n}`);
    }
  });
  if (total > LIMITS.maxTotalChars) issues.push("The combined size of all responses is too large.");
  return issues;
}

export function sanitizeWeights(w: unknown): ScoreWeights {
  const out = { ...DEFAULT_WEIGHTS };
  if (!isRecord(w)) return out;
  for (const k of Object.keys(out) as Array<keyof ScoreWeights>) {
    const v = w[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100) out[k] = v;
  }
  if (Object.values(out).every((v) => v === 0)) return { ...DEFAULT_WEIGHTS };
  return out;
}

export function validateAnalysisRequest(body: unknown): AnalysisRequest {
  if (!isRecord(body)) throw new ValidationError(["Request body must be a JSON object."]);
  const issues = validateResponses(body.question, body.responses);
  const mode = body.mode === "native" ? "native" : body.mode === "hybrid" ? "hybrid" : null;
  if (!mode) issues.push('mode must be "native" or "hybrid".');
  if (issues.length) throw new ValidationError(issues);
  return {
    question: (body.question as string).trim(),
    responses: (body.responses as ResponseInput[]).map((r) => ({
      id: r.id,
      label: r.label.trim(),
      text: r.text.replace(/\r\n/g, "\n").trim(),
    })),
    mode: mode as "native" | "hybrid",
    weights: sanitizeWeights(body.weights),
  };
}

const PROVIDERS: ProviderId[] = ["gemini", "groq", "ollama"];

export function validateProviderConfig(body: unknown, opts: { allowOllama: boolean }): ProviderConfig {
  if (!isRecord(body)) throw new ValidationError(["provider configuration is required."]);
  const issues: string[] = [];
  const provider = body.provider as ProviderId;
  if (!PROVIDERS.includes(provider)) issues.push("provider must be gemini, groq or ollama.");
  if (provider === "ollama" && !opts.allowOllama)
    issues.push("Ollama runs in your browser against your local machine; it cannot be called through the server.");
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model || model.length > 120 || !/^[\w.:/@-]+$/.test(model)) issues.push("A valid model name is required.");
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (provider !== "ollama" && (apiKey.length < 8 || apiKey.length > 400 || /\s/.test(apiKey)))
    issues.push("A valid API key is required.");
  if (issues.length) throw new ValidationError(issues);
  return {
    provider,
    model,
    apiKey: provider === "ollama" ? undefined : apiKey,
    baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
    embeddingModel: typeof body.embeddingModel === "string" && body.embeddingModel.trim() ? body.embeddingModel.trim() : undefined,
  };
}
