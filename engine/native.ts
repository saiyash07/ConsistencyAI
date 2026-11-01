import { STOPWORDS, splitSentences, tokenize } from "./text";
import type { ResponseInput, RuleBasedFlag } from "./types";

const NEGATIONS = new Set(["not", "no", "never", "cannot", "can't", "isn't", "aren't", "doesn't", "don't", "unnecessary", "without", "none", "neither"]);

function entities(sentence: string): Set<string> {
  const out = new Set<string>();
  const words = sentence.replace(/[^A-Za-z0-9'’\s-]/g, " ").split(/\s+/).filter(Boolean);
  words.forEach((w, i) => {
    if (/^[A-Z][a-z]+/.test(w) && !(i === 0 && STOPWORDS.has(w.toLowerCase())) && !["I"].includes(w)) {
      out.add(w.replace(/['’]s$/, "").toLowerCase());
    }
  });
  return out;
}

function numbers(sentence: string): Set<string> {
  return new Set(sentence.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []);
}

function contentSet(sentence: string): Set<string> {
  return new Set(tokenize(sentence).filter((t) => !STOPWORDS.has(t) && t.length > 2));
}

/** Overlap relative to the SMALLER sentence – tolerant of one sentence adding extra detail. */
function containment(a: Set<string>, b: Set<string>): { shared: number; ratio: number } {
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  const min = Math.min(a.size, b.size);
  return { shared, ratio: min === 0 ? 0 : shared / min };
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Rule-based candidate disagreements used by the native (no-LLM) mode.
 * Compares sentences that share most of their non-entity wording and flags:
 *  - differing named entities in the same "slot" (e.g. Canberra vs Sydney),
 *  - differing numbers,
 *  - asymmetric negation.
 * These are CANDIDATES for human review, not verified contradictions.
 */
export function ruleBasedFlags(responses: ResponseInput[]): RuleBasedFlag[] {
  const sents = responses.map((r) => splitSentences(r.text).map((s) => ({ s, ents: entities(s) })));
  const flags: RuleBasedFlag[] = [];
  for (let i = 0; i < responses.length; i++) {
    for (let j = i + 1; j < responses.length; j++) {
      let found: RuleBasedFlag | null = null;
      for (const a of sents[i]) {
        for (const b of sents[j]) {
          const { shared, ratio } = containment(contentSet(a.s), contentSet(b.s));
          if (shared < 2 || ratio < 0.45) continue;
          const onlyA = [...a.ents].filter((e) => !b.ents.has(e));
          const onlyB = [...b.ents].filter((e) => !a.ents.has(e));
          const sharedEnt = [...a.ents].some((e) => b.ents.has(e));
          const mk = (kind: RuleBasedFlag["kind"], detail: string): RuleBasedFlag => ({
            responseAId: responses[i].id, responseBId: responses[j].id, sentenceA: a.s, sentenceB: b.s, kind, detail,
          });
          // Only compare sentences with a similar entity count to avoid asymmetric noise.
          if (onlyA.length >= 1 && onlyB.length >= 1 && onlyA.length <= 2 && onlyB.length <= 2 && sharedEnt && Math.abs(a.ents.size - b.ents.size) <= 1) {
            found ??= mk("differing_entity", `Same wording but different named entities: "${onlyA.join(", ")}" vs "${onlyB.join(", ")}".`);
            continue;
          }
          const na = numbers(a.s), nb = numbers(b.s);
          if (na.size && nb.size && jaccard(na, nb) === 0) {
            found ??= mk("numeric_mismatch", `Different numbers: ${[...na].join(", ")} vs ${[...nb].join(", ")}.`);
            continue;
          }
          const negA = tokenize(a.s).some((t) => NEGATIONS.has(t));
          const negB = tokenize(b.s).some((t) => NEGATIONS.has(t));
          if (negA !== negB) found ??= mk("negation_mismatch", `One sentence is negated and the other is not.`);
        }
      }
      if (found) flags.push(found);
    }
  }
  return flags;
}
