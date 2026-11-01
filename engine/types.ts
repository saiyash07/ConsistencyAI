/** Shared types for the evaluation engine (used by the browser, the API and tests). */

export type ProviderId = "gemini" | "groq" | "ollama";
export type AnalysisMode = "native" | "hybrid";

export const LIMITS = {
  minResponses: 2,
  maxResponses: 10,
  maxResponseChars: 8000,
  maxQuestionChars: 2000,
  maxLabelChars: 40,
  maxTotalChars: 60000,
} as const;

export interface ResponseInput {
  id: string;
  label: string;
  text: string;
}

export interface ProviderConfig {
  provider: ProviderId;
  /** Cloud providers only. Never persisted or logged. */
  apiKey?: string;
  model: string;
  /** Ollama only: server address, e.g. http://localhost:11434 */
  baseUrl?: string;
  /** Ollama only: embedding model (e.g. nomic-embed-text). */
  embeddingModel?: string;
}

export interface ScoreWeights {
  textual: number;
  semantic: number;
  claim: number;
  structural: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  textual: 0.2,
  semantic: 0.3,
  claim: 0.35,
  structural: 0.15,
};

export interface AnalysisRequest {
  question: string;
  responses: ResponseInput[];
  mode: AnalysisMode;
  weights?: Partial<ScoreWeights>;
}

export type StageStatus = "ok" | "unavailable" | "failed" | "skipped";
export interface StageInfo {
  status: StageStatus;
  /** Human-readable reason when not ok. */
  reason?: string;
}

export type MetricKey = keyof ScoreWeights;

/** Square matrix indexed by response order. */
export interface SimilarityMatrix {
  ids: string[];
  values: number[][];
}

export interface StructureProfile {
  responseId: string;
  words: number;
  sentences: number;
  paragraphs: number;
  hasHeading: boolean;
  hasBullets: boolean;
  hasNumberedList: boolean;
  listItems: number;
  /** Estimated number of distinct points made (heuristic). */
  estimatedPoints: number;
  /** Average words per sentence – a rough proxy for explanation depth. */
  avgSentenceLength: number;
}

export interface RequestedElements {
  /** e.g. "three advantages" -> { count: 3, noun: "advantages" } */
  count: number | null;
  noun: string | null;
  /** Explicit sentence-count constraint such as "in 2-3 sentences". */
  sentenceRange: [number, number] | null;
}

export interface StructureFinding {
  responseId: string;
  severity: "info" | "warning";
  message: string;
}

export interface StructureAnalysis {
  profiles: StructureProfile[];
  requested: RequestedElements;
  findings: StructureFinding[];
  /** 0..1, or null when fewer than 2 responses. */
  score: number | null;
}

export interface Claim {
  id: string;
  responseId: string;
  /** Verbatim text copied from the response (traceability). */
  originalText: string;
  normalizedText: string;
  subject: string;
  predicate: string;
  object: string | null;
  qualifiers: string[];
  /** Model-reported certainty 0..1, or null when not reported. */
  confidence: number | null;
  /** True if originalText was found verbatim in the response. */
  grounded: boolean;
}

export type Relation =
  | "agreement"
  | "contradiction"
  | "partial_agreement"
  | "additional_information"
  | "insufficient_information"
  | "uncertain";

export const RELATIONS: Relation[] = [
  "agreement",
  "contradiction",
  "partial_agreement",
  "additional_information",
  "insufficient_information",
  "uncertain",
];

export interface ClaimRelation {
  claimAId: string;
  claimBId: string;
  responseAId: string;
  responseBId: string;
  relation: Relation;
  explanation: string;
  confidence: number | null;
  source: "llm" | "rule-based";
}

/** Verdict between two responses, derived from claim relations. */
export type PairVerdict = "agreement" | "contradiction" | "partial" | "no_decisive_evidence";

export interface PairClaimSummary {
  responseAId: string;
  responseBId: string;
  agreement: number;
  partial: number;
  contradiction: number;
  other: number;
  /** (agree + 0.5*partial) / (agree + partial + contradiction); null if no decisive relations. */
  agreementScore: number | null;
  verdict: PairVerdict;
}

export interface OutlierResult {
  responseId: string;
  isOutlier: boolean;
  /** 0..1 – larger means more different from the rest. */
  distance: number | null;
  reasons: string[];
}

export interface OutlierAnalysis {
  applicable: boolean;
  note?: string;
  results: OutlierResult[];
}

export interface MetricScore {
  value: number | null;
  status: "available" | "unavailable";
  reason?: string;
  /** Plain-language description of how the value was computed. */
  method: string;
}

export interface ConsistencyScores {
  textual: MetricScore;
  semantic: MetricScore;
  claim: MetricScore;
  structural: MetricScore;
  overall: {
    value: number | null;
    completeness: "complete" | "partial" | "unavailable";
    missing: MetricKey[];
    weightsConfigured: ScoreWeights;
    /** Weights after renormalising over available metrics (sum to 1). */
    weightsApplied: Partial<ScoreWeights>;
    note: string;
  };
}

export interface RuleBasedFlag {
  responseAId: string;
  responseBId: string;
  sentenceA: string;
  sentenceB: string;
  kind: "differing_entity" | "numeric_mismatch" | "negation_mismatch";
  detail: string;
}

export interface LLMExplanation {
  text: string;
  source: "llm" | "rule-based";
}

export interface AnalysisResult {
  version: 1;
  id: string;
  createdAt: string;
  question: string;
  responses: ResponseInput[];
  mode: AnalysisMode;
  /** Provider & model that produced LLM-assisted outputs (never contains a key). */
  provider: { provider: ProviderId; model: string; embeddingModel?: string } | null;
  stages: {
    textual: StageInfo;
    semantic: StageInfo;
    structure: StageInfo;
    claims: StageInfo;
    contradictions: StageInfo;
    explanation: StageInfo;
  };
  textualSimilarity: SimilarityMatrix | null;
  semanticSimilarity: SimilarityMatrix | null;
  structure: StructureAnalysis;
  claims: Claim[];
  relations: ClaimRelation[];
  pairSummaries: PairClaimSummary[];
  ruleBasedFlags: RuleBasedFlag[];
  outliers: OutlierAnalysis;
  scores: ConsistencyScores;
  explanation: LLMExplanation;
  limitations: string[];
  warnings: string[];
}
