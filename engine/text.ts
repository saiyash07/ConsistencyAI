/** Text normalisation, tokenisation and sentence segmentation. */

export const STOPWORDS = new Set(
  (
    "a an the and or but if then else of to in on at by for with from as is are was were be been being " +
    "it its this that these those there here which who whom whose what when where why how not no nor so " +
    "than too very can could should would may might must shall will do does did done have has had having " +
    "i you he she we they me him her us them my your his our their also into over under about between " +
    "such some any each other more most both only own same just while during before after again further"
  ).split(/\s+/)
);

/** Lowercase, strip accents and markdown punctuation, collapse whitespace. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[*_`#>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word tokens from normalised text (letters/digits, apostrophes dropped). */
export function tokenize(text: string): string[] {
  return normalizeText(text)
    .replace(/'s\b/g, "")
    .replace(/[^a-z0-9%.\s-]/g, " ")
    .replace(/(?<![0-9])\.|\.(?![0-9])/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter(Boolean);
}

/** Tokens with stopwords removed – the vocabulary used for TF-IDF. */
export function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => !STOPWORDS.has(t) && t.length > 1);
}

const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|dr|mr|mrs|ms|prof|st|no|fig|approx|u\.s|u\.k)\.$/i;

/**
 * Split text into sentences. Handles list markers, abbreviations and
 * decimals; one list item is treated as one sentence.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const cleaned = line.replace(/^(?:[-*•]|\d+[.)])\s+/, "").replace(/^#{1,6}\s+/, "");
    if (!cleaned) continue;
    const parts = cleaned.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/);
    let buffer = "";
    for (const part of parts) {
      buffer = buffer ? `${buffer} ${part}` : part;
      if (ABBREVIATIONS.test(buffer)) continue;
      out.push(buffer.trim());
      buffer = "";
    }
    if (buffer.trim()) out.push(buffer.trim());
  }
  return out.filter((s) => /[A-Za-z0-9]/.test(s));
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function countWords(text: string): number {
  const m = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g);
  return m ? m.length : 0;
}

export function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
