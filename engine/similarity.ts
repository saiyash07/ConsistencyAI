import { contentTokens } from "./text";
import type { SimilarityMatrix } from "./types";

/** Cosine similarity of two dense vectors. Returns 0 for zero vectors. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("Vector length mismatch");
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * TF-IDF vectors over the combined vocabulary.
 * tf = count / doc length; idf = ln((1+N)/(1+df)) + 1 (smoothed, always > 0).
 */
export function tfidfVectors(docs: string[]): number[][] {
  const tokenised = docs.map(contentTokens);
  const vocab = new Map<string, number>();
  for (const toks of tokenised) for (const t of toks) if (!vocab.has(t)) vocab.set(t, vocab.size);
  const N = docs.length;
  const df = new Array<number>(vocab.size).fill(0);
  for (const toks of tokenised) for (const t of new Set(toks)) df[vocab.get(t)!]++;
  const idf = df.map((d) => Math.log((1 + N) / (1 + d)) + 1);
  return tokenised.map((toks) => {
    const v = new Array<number>(vocab.size).fill(0);
    for (const t of toks) v[vocab.get(t)!] += 1;
    const len = toks.length || 1;
    return v.map((c, i) => (c / len) * idf[i]);
  });
}

export function similarityMatrix(ids: string[], vectors: number[][], clampNegative = true): SimilarityMatrix {
  const n = vectors.length;
  const values = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = i === j ? 1 : cosine(vectors[i], vectors[j]);
      if (clampNegative) s = Math.max(0, Math.min(1, s));
      values[i][j] = s;
      values[j][i] = s;
    }
  }
  return { ids, values };
}

/** Textual (lexical) similarity matrix using TF-IDF + cosine. NOT a semantic measure. */
export function textualSimilarity(ids: string[], texts: string[]): SimilarityMatrix {
  return similarityMatrix(ids, tfidfVectors(texts));
}

/** Semantic similarity from precomputed embeddings. */
export function semanticSimilarity(ids: string[], embeddings: number[][]): SimilarityMatrix {
  return similarityMatrix(ids, embeddings);
}

/** All unique unordered pair values (i<j) of a matrix. */
export function pairValues(m: SimilarityMatrix): number[] {
  const out: number[] = [];
  for (let i = 0; i < m.values.length; i++)
    for (let j = i + 1; j < m.values.length; j++) out.push(m.values[i][j]);
  return out;
}

/** Cosine similarity between two short texts using TF-IDF over just those texts. */
export function pairTextSimilarity(a: string, b: string): number {
  const [va, vb] = tfidfVectors([a, b]);
  return cosine(va, vb);
}
