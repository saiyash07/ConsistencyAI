import { CLAIM_SYSTEM } from "../engine/llm/claims";
import { RELATION_SYSTEM } from "../engine/llm/relations";
import { EXPLAIN_SYSTEM } from "../engine/llm/explain";
import { ProviderError } from "../engine/providers/types";
import type { AIProvider, GenerateOptions } from "../engine/providers/types";
import { splitSentences, tokenize } from "../engine/text";

export function mockFetch(handler: (url: string, init: RequestInit) => { status?: number; body?: unknown; raw?: string } | Promise<never>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = await handler(String(url), init);
    const status = r.status ?? 200;
    const text = r.raw ?? JSON.stringify(r.body ?? {});
    return new Response(text, { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const ENTS = (s: string) => new Set((s.match(/\b[A-Z][a-z]+/g) ?? []).map((w) => w.toLowerCase()));

/**
 * A DETERMINISTIC STAND-IN for an LLM, used only to test the pipeline plumbing
 * (schema handling, scoring, partial failures). It is not evidence about real model quality.
 * Claims = sentences; relation = entity-set comparison; embeddings = synonym-group bag of words.
 */
export class FakeProvider implements AIProvider {
  readonly id = "gemini" as const;
  readonly model = "fake-model";
  supportsEmbeddings = true;
  calls = { claims: 0, relations: 0, explain: 0, embed: 0 };
  failClaimsFor: string | null = null;
  failExplain = false;
  failRelations = false;
  failEmbedding = false;
  authError = false;

  async generate(o: GenerateOptions): Promise<string> {
    if (this.authError) throw new ProviderError("auth", "Authentication failed");
    if (o.system === CLAIM_SYSTEM) {
      this.calls.claims++;
      const answer = o.prompt.split('Answer to analyse:\n"""')[1].split('"""')[0];
      if (this.failClaimsFor && answer.includes(this.failClaimsFor)) throw new ProviderError("rate_limit", "Rate limit reached");
      const claims = splitSentences(answer).map((s) => ({
        originalText: s,
        normalizedText: s,
        subject: tokenize(s)[0] ?? "x",
        predicate: "states",
        object: null,
        qualifiers: [],
        confidence: 0.9,
      }));
      return JSON.stringify({ claims });
    }
    if (o.system === RELATION_SYSTEM) {
      this.calls.relations++;
      if (this.failRelations) throw new ProviderError("unavailable", "down");
      const anchor = o.prompt.split("ANCHOR answer")[1].split("OTHER answers:")[0];
      const others = o.prompt.split("OTHER answers:")[1];
      const parse = (block: string) => [...block.matchAll(/^(C\d+): (.+)$/gm)].map((m) => ({ id: m[1], text: m[2].replace(/ \[qualifiers.*$/, "") }));
      const A = parse(anchor), B = parse(others);
      const relations: unknown[] = [];
      for (const a of A) for (const b of B) {
        const ea = ENTS(a.text), eb = ENTS(b.text);
        const sharedTopic = tokenize(a.text).filter((t) => tokenize(b.text).includes(t) && t.length > 4).length >= 2;
        if (!sharedTopic) continue;
        const same = [...ea].every((e) => eb.has(e)) && [...eb].every((e) => ea.has(e));
        relations.push({ anchorClaimId: a.id, otherClaimId: b.id, relation: same ? "agreement" : "contradiction", explanation: same ? "Same entities." : "Different entities for the same topic.", confidence: 0.8 });
      }
      return JSON.stringify({ relations });
    }
    if (o.system === EXPLAIN_SYSTEM) {
      this.calls.explain++;
      if (this.failExplain) throw new ProviderError("timeout", "slow");
      return JSON.stringify({ summary: "Fake LLM explanation of the consistency analysis results." });
    }
    throw new Error("unexpected prompt");
  }

  async embed(texts: string[]): Promise<number[][]> {
    this.calls.embed++;
    if (this.failEmbedding) throw new ProviderError("unavailable", "embedding down");
    const groups = [["heart", "cardiovascular"], ["muscles", "muscular", "strength", "strengthens"], ["mental", "stress", "well-being"], ["unnecessary", "inactivity"]];
    return texts.map((t) => {
      const toks = tokenize(t);
      return [...groups.map((g) => toks.filter((x) => g.some((w) => x.startsWith(w.slice(0, 6)))).length), 0.01];
    });
  }

  async listModels() { return ["fake-model"]; }
}
