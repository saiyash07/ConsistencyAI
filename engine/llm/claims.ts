import { generateValidated } from "./json";
import { contentTokens, normalizeText } from "../text";
import type { AIProvider } from "../providers/types";
import type { Claim, ResponseInput } from "../types";

export const MAX_CLAIMS_PER_RESPONSE = 12;

export const CLAIM_SYSTEM = `You extract factual claims from a single answer to a question. You are a careful, literal analyst.
Rules:
- Extract only claims that are explicitly stated in the answer. Never add outside knowledge or infer unstated facts.
- Each claim must be one atomic, checkable statement. Skip opinions, greetings and filler.
- "originalText" MUST be copied verbatim from the answer (a contiguous span).
- "normalizedText" restates the claim as a short self-contained sentence without pronouns.
- Keep qualifiers (dates, conditions, quantities, hedges such as "usually") in "qualifiers".
- "confidence" (0-1) is how definitely the answer asserts the claim (hedged = lower). Use null if unsure.
- Do NOT judge whether claims are true.
Reply with ONLY a JSON object.`;

export function claimPrompt(question: string, r: ResponseInput): string {
  return `Question:\n"""${question}"""\n\nAnswer to analyse:\n"""${r.text}"""\n\nReturn JSON of the form:
{"claims":[{"originalText":"...","normalizedText":"...","subject":"...","predicate":"...","object":"..." or null,"qualifiers":["..."],"confidence":0.0-1.0 or null}]}
Return at most ${MAX_CLAIMS_PER_RESPONSE} claims. If the answer contains no factual claims, return {"claims":[]}.`;
}

interface RawClaim {
  originalText: string;
  normalizedText: string;
  subject: string;
  predicate: string;
  object: string | null;
  qualifiers: string[];
  confidence: number | null;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Strict validator for the claim-extraction payload. Throws on structural problems. */
export function validateClaimPayload(raw: unknown): RawClaim[] {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { claims?: unknown }).claims))
    throw new Error('expected an object with a "claims" array');
  const out: RawClaim[] = [];
  for (const c of (raw as { claims: unknown[] }).claims.slice(0, MAX_CLAIMS_PER_RESPONSE)) {
    if (typeof c !== "object" || c === null) throw new Error("claim must be an object");
    const o = c as Record<string, unknown>;
    const originalText = str(o.originalText);
    const normalizedText = str(o.normalizedText) || originalText;
    if (!originalText) throw new Error("claim missing originalText");
    const subject = str(o.subject);
    const predicate = str(o.predicate);
    if (!subject || !predicate) throw new Error("claim missing subject or predicate");
    const qualifiers = Array.isArray(o.qualifiers) ? o.qualifiers.map(str).filter(Boolean).slice(0, 8) : [];
    const conf = typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1 ? o.confidence : null;
    out.push({ originalText, normalizedText, subject, predicate, object: str(o.object) || null, qualifiers, confidence: conf });
  }
  return out;
}

/**
 * A claim is "grounded" if its original text appears in the response, either
 * verbatim (after normalisation) or with ≥85% of its content words present.
 * Ungrounded claims are kept for transparency but excluded from comparison.
 */
export function isGrounded(original: string, responseText: string): boolean {
  const o = normalizeText(original);
  const r = normalizeText(responseText);
  if (o && r.includes(o)) return true;
  const ot = contentTokens(original);
  if (ot.length === 0) return false;
  const rs = new Set(contentTokens(responseText));
  return ot.filter((t) => rs.has(t)).length / ot.length >= 0.85;
}

export async function extractClaims(
  provider: AIProvider,
  question: string,
  response: ResponseInput,
  nextId: () => string,
  signal?: AbortSignal
): Promise<Claim[]> {
  const raw = await generateValidated(provider, CLAIM_SYSTEM, claimPrompt(question, response), validateClaimPayload, signal);
  return raw.map((c) => ({
    id: nextId(),
    responseId: response.id,
    originalText: c.originalText,
    normalizedText: c.normalizedText,
    subject: c.subject,
    predicate: c.predicate,
    object: c.object,
    qualifiers: c.qualifiers,
    confidence: c.confidence,
    grounded: isGrounded(c.originalText, response.text),
  }));
}
