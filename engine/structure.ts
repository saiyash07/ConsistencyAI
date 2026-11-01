import { countWords, mean, round, splitParagraphs, splitSentences } from "./text";
import type {
  RequestedElements,
  ResponseInput,
  StructureAnalysis,
  StructureFinding,
  StructureProfile,
} from "./types";

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/** Detects explicit requests such as "three major advantages" or "in 2-3 sentences". */
export function detectRequestedElements(question: string): RequestedElements {
  const q = question.toLowerCase();
  let count: number | null = null;
  let noun: string | null = null;
  const m = q.match(
    /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:major|key|main|important|primary|common|top|distinct|different|specific)\s+)*([a-z-]+)/g
  );
  const nounRe = /^(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:(?:major|key|main|important|primary|common|top|distinct|different|specific)\s+)*([a-z-]+)$/;
  const countable = /^(advantages?|benefits?|reasons?|examples?|ways?|steps?|factors?|causes?|effects?|points?|disadvantages?|drawbacks?|differences?|features?|tips?|methods?|ideas?|things?|problems?|challenges?|risks?|uses?|types?|principles?)$/;
  for (const piece of m ?? []) {
    const mm = piece.match(nounRe);
    if (mm && countable.test(mm[2])) {
      const raw = mm[1];
      count = /^\d+$/.test(raw) ? parseInt(raw, 10) : NUMBER_WORDS[raw];
      noun = mm[2];
      break;
    }
  }
  let sentenceRange: [number, number] | null = null;
  const sr = q.match(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s+sentences?\b/);
  if (sr) sentenceRange = [parseInt(sr[1], 10), parseInt(sr[2], 10)];
  else {
    const one = q.match(/\b(?:in|within|using)\s+(\d{1,2}|one|two|three|four|five)\s+sentences?\b/);
    if (one) {
      const n = /^\d+$/.test(one[1]) ? parseInt(one[1], 10) : NUMBER_WORDS[one[1]];
      sentenceRange = [n, n];
    }
  }
  return { count, noun, sentenceRange };
}

/**
 * Heuristic estimate of how many distinct points a response makes:
 * list items if it uses a list, otherwise the largest enumeration
 * ("a, b and c") found in any single sentence.
 */
export function estimatePoints(text: string, listItems: number): number {
  if (listItems >= 2) return listItems;
  let best = 1;
  for (const sentence of splitSentences(text)) {
    let s = sentence;
    const lead = s.match(/(?:including|such as|namely|:)\s+(.*)$/i);
    if (lead) s = lead[1];
    const parts = s
      .split(/\s*,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+as well as\s+/i)
      .map((p) => p.trim())
      .filter((p) => countWords(p) >= 1);
    if (parts.length > best) best = parts.length;
  }
  return best;
}

export function profileResponse(r: ResponseInput): StructureProfile {
  const text = r.text;
  const lines = text.split(/\r?\n/);
  const hasHeading = lines.some((l) => /^\s*#{1,6}\s+\S/.test(l) || /^\s*\*\*[^*]+\*\*:?\s*$/.test(l));
  const bulletLines = lines.filter((l) => /^\s*[-*•]\s+\S/.test(l)).length;
  const numberedLines = lines.filter((l) => /^\s*\d+[.)]\s+\S/.test(l)).length;
  const words = countWords(text);
  const sentences = splitSentences(text).length;
  const listItems = Math.max(bulletLines, numberedLines);
  return {
    responseId: r.id,
    words,
    sentences,
    paragraphs: splitParagraphs(text).length || 1,
    hasHeading,
    hasBullets: bulletLines > 0,
    hasNumberedList: numberedLines > 0,
    listItems,
    estimatedPoints: estimatePoints(text, listItems),
    avgSentenceLength: sentences ? round(words / sentences, 1) : 0,
  };
}

/** Pairwise structural similarity: 50% length ratio, 50% format-flag agreement. */
export function pairStructuralSimilarity(a: StructureProfile, b: StructureProfile): number {
  const lengthSim = Math.max(a.words, b.words) === 0 ? 1 : Math.min(a.words, b.words) / Math.max(a.words, b.words);
  const flags: Array<[boolean, boolean]> = [
    [a.hasHeading, b.hasHeading],
    [a.hasBullets, b.hasBullets],
    [a.hasNumberedList, b.hasNumberedList],
    [a.paragraphs > 1, b.paragraphs > 1],
  ];
  const formatSim = flags.filter(([x, y]) => x === y).length / flags.length;
  return 0.5 * lengthSim + 0.5 * formatSim;
}

export function analyzeStructure(question: string, responses: ResponseInput[]): StructureAnalysis {
  const profiles = responses.map(profileResponse);
  const requested = detectRequestedElements(question);
  const labelOf = (id: string) => responses.find((r) => r.id === id)?.label ?? id;
  const findings: StructureFinding[] = [];

  if (requested.count !== null) {
    for (const p of profiles) {
      if (p.estimatedPoints < requested.count) {
        findings.push({
          responseId: p.responseId,
          severity: "warning",
          message: `${labelOf(p.responseId)} appears to give about ${p.estimatedPoints} of the ${requested.count} requested ${requested.noun} (heuristic estimate).`,
        });
      }
    }
  }
  if (requested.sentenceRange) {
    const [lo, hi] = requested.sentenceRange;
    for (const p of profiles) {
      if (p.sentences < lo || p.sentences > hi) {
        findings.push({
          responseId: p.responseId,
          severity: "warning",
          message: `${labelOf(p.responseId)} has ${p.sentences} sentence(s); the question asked for ${lo === hi ? lo : `${lo}–${hi}`}.`,
        });
      }
    }
  }
  const sorted = [...profiles].map((p) => p.words).sort((a, b) => a - b);
  const med = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  if (profiles.length >= 3 && med > 0) {
    for (const p of profiles) {
      if (p.words < med * 0.4)
        findings.push({ responseId: p.responseId, severity: "info", message: `${labelOf(p.responseId)} is much shorter than the median response (${p.words} vs ${med} words).` });
      else if (p.words > med * 2.5)
        findings.push({ responseId: p.responseId, severity: "info", message: `${labelOf(p.responseId)} is much longer than the median response (${p.words} vs ${med} words).` });
    }
  }
  const fmt = (p: StructureProfile) => (p.hasNumberedList ? "numbered list" : p.hasBullets ? "bullet list" : p.paragraphs > 1 ? "multiple paragraphs" : "single paragraph");
  const formats = new Set(profiles.map(fmt));
  if (formats.size > 1) {
    findings.push({
      responseId: "*",
      severity: "info",
      message: `Responses use different formats: ${profiles.map((p) => `${labelOf(p.responseId)} = ${fmt(p)}`).join("; ")}.`,
    });
  }

  // Score: mean pairwise structural similarity, blended with coverage agreement when a count was requested.
  let score: number | null = null;
  if (profiles.length >= 2) {
    const sims: number[] = [];
    for (let i = 0; i < profiles.length; i++)
      for (let j = i + 1; j < profiles.length; j++) sims.push(pairStructuralSimilarity(profiles[i], profiles[j]));
    score = mean(sims);
    if (score !== null && requested.count !== null) {
      const cov = profiles.map((p) => Math.min(1, p.estimatedPoints / (requested.count as number)));
      const covAgreement = 1 - (Math.max(...cov) - Math.min(...cov));
      score = 0.7 * score + 0.3 * covAgreement;
    }
  }
  return { profiles, requested, findings, score: score === null ? null : round(score, 4) };
}
