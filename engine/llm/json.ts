import { ProviderError } from "../providers/types";
import type { AIProvider } from "../providers/types";

/** Extract and parse the first JSON object from model output (tolerates code fences / prose). */
export function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
  }
  throw new ProviderError("bad_response", "The model did not return valid JSON.");
}

/**
 * Call the model expecting JSON, validate it, and retry once (with the
 * validation error fed back) if the output is malformed.
 */
export async function generateValidated<T>(
  provider: AIProvider,
  system: string,
  prompt: string,
  validate: (raw: unknown) => T,
  signal?: AbortSignal
): Promise<T> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await provider.generate({
      system,
      prompt: attempt === 0 ? prompt : `${prompt}\n\nYour previous reply was invalid (${lastError}). Reply again with ONLY the corrected JSON object.`,
      json: true,
      temperature: 0,
      signal,
    });
    try {
      return validate(parseJsonLoose(text));
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  throw new ProviderError("bad_response", `The model's output failed schema validation: ${lastError}`);
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
