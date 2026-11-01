import type { AnalysisResult, ScoreWeights } from "../../engine/types";
import { DEFAULT_WEIGHTS } from "../../engine/types";

/**
 * localStorage is used ONLY for non-secret conveniences: saved evaluation results
 * (which never contain API keys) and scoring weights. API keys are never stored here.
 */
const HISTORY_KEY = "consistency-ai:history:v1";
const SETTINGS_KEY = "consistency-ai:settings:v1";
const MAX_HISTORY = 25;

export interface PersistedSettings {
  historyEnabled: boolean;
  weights: ScoreWeights;
}
export const DEFAULT_SETTINGS: PersistedSettings = { historyEnabled: true, weights: DEFAULT_WEIGHTS };

export function loadSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<PersistedSettings>;
    return { historyEnabled: p.historyEnabled !== false, weights: { ...DEFAULT_WEIGHTS, ...(p.weights ?? {}) } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export function saveSettings(s: PersistedSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export function loadHistory(): AnalysisResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? (JSON.parse(raw) as AnalysisResult[]) : [];
    return Array.isArray(arr) ? arr.filter((r) => r && r.version === 1) : [];
  } catch {
    return [];
  }
}
export function saveHistory(items: AnalysisResult[]): void {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY))); } catch { /* quota or unavailable */ }
}
