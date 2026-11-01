import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AnalysisResult, ProviderConfig, ProviderId, ScoreWeights } from "../../engine/types";
import { GEMINI_DEFAULT_MODEL } from "../../engine/providers/gemini";
import { GROQ_DEFAULT_MODEL } from "../../engine/providers/groq";
import { OLLAMA_DEFAULT_URL } from "../../engine/providers/ollama";
import { testConnection } from "../lib/api";
import type { ConnectionInfo } from "../lib/api";
import { loadHistory, loadSettings, saveHistory, saveSettings } from "../lib/storage";

export interface ProviderSlot {
  apiKey: string;
  baseUrl: string;
  model: string;
  embeddingModel: string;
  models: string[];
  status: "idle" | "testing" | "connected" | "error";
  error?: string;
  supportsEmbeddings?: boolean;
}

export type Target = "native" | ProviderId;

export interface DraftResponse { id: string; label: string; text: string }
export interface Draft { question: string; responses: DraftResponse[] }

const blank = (model: string): ProviderSlot => ({ apiKey: "", baseUrl: OLLAMA_DEFAULT_URL, model, embeddingModel: "", models: [], status: "idle" });
const initialSlots = (): Record<ProviderId, ProviderSlot> => ({
  gemini: blank(GEMINI_DEFAULT_MODEL),
  groq: blank(GROQ_DEFAULT_MODEL),
  ollama: blank(""),
});

let counter = 0;
export const newResponseId = () => `resp-${Date.now().toString(36)}-${++counter}`;
export const labelFor = (i: number) => `Response ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ""}`;
export const emptyDraft = (): Draft => ({
  question: "",
  responses: [0, 1].map((i) => ({ id: newResponseId(), label: labelFor(i), text: "" })),
});

interface AppState {
  /** API keys live ONLY in this in-memory state. */
  slots: Record<ProviderId, ProviderSlot>;
  updateSlot: (id: ProviderId, patch: Partial<ProviderSlot>) => void;
  connect: (id: ProviderId) => Promise<boolean>;
  disconnect: (id: ProviderId) => void;
  configFor: (id: ProviderId) => ProviderConfig;
  target: Target;
  setTarget: (t: Target) => void;
  draft: Draft;
  setDraft: (d: Draft) => void;
  history: AnalysisResult[];
  addResult: (r: AnalysisResult) => void;
  getResult: (id: string) => AnalysisResult | undefined;
  removeResult: (id: string) => void;
  clearHistory: () => void;
  historyEnabled: boolean;
  setHistoryEnabled: (v: boolean) => void;
  weights: ScoreWeights;
  setWeights: (w: ScoreWeights) => void;
  /** Result of the most recent run (kept even if history is disabled). */
  session: Record<string, AnalysisResult>;
}

const Ctx = createContext<AppState | null>(null);
export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppStateProvider");
  return v;
};

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState(initialSlots);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [target, setTarget] = useState<Target>("native");
  const [history, setHistory] = useState<AnalysisResult[]>(() => loadHistory());
  const [session, setSession] = useState<Record<string, AnalysisResult>>({});
  const [settings, setSettings] = useState(() => loadSettings());

  useEffect(() => { saveSettings(settings); }, [settings]);

  const updateSlot = useCallback((id: ProviderId, patch: Partial<ProviderSlot>) => {
    setSlots((s) => ({ ...s, [id]: { ...s[id], ...patch } }));
  }, []);

  const configFor = useCallback((id: ProviderId): ProviderConfig => {
    const s = slots[id];
    return { provider: id, apiKey: id === "ollama" ? undefined : s.apiKey, model: s.model, baseUrl: id === "ollama" ? s.baseUrl : undefined, embeddingModel: id === "ollama" ? s.embeddingModel || undefined : undefined };
  }, [slots]);

  const connect = useCallback(async (id: ProviderId) => {
    const s = slots[id];
    updateSlot(id, { status: "testing", error: undefined });
    try {
      const info: ConnectionInfo = await testConnection({ provider: id, apiKey: s.apiKey, model: s.model || "unused", baseUrl: s.baseUrl, embeddingModel: s.embeddingModel || undefined });
      const model = id === "ollama"
        ? (s.model && info.models.includes(s.model) ? s.model : info.suggestedModel ?? "")
        : info.models.includes(s.model) ? s.model : info.models[0] ?? s.model;
      updateSlot(id, {
        status: "connected", models: info.models, supportsEmbeddings: info.supportsEmbeddings, model,
        ...(id === "ollama" ? { embeddingModel: s.embeddingModel && info.models.includes(s.embeddingModel) ? s.embeddingModel : info.suggestedEmbeddingModel ?? "" } : {}),
        error: id === "ollama" && !model ? "Connected, but no chat model is installed. Run: ollama pull llama3.2" : undefined,
      });
      return true;
    } catch (e) {
      updateSlot(id, { status: "error", error: e instanceof Error ? e.message : "Connection failed." });
      return false;
    }
  }, [slots, updateSlot]);

  /** Clears the key and everything derived from it. */
  const disconnect = useCallback((id: ProviderId) => {
    setSlots((s) => ({ ...s, [id]: { ...blank(id === "gemini" ? GEMINI_DEFAULT_MODEL : id === "groq" ? GROQ_DEFAULT_MODEL : ""), baseUrl: s[id].baseUrl } }));
  }, []);

  const addResult = useCallback((r: AnalysisResult) => {
    setSession((s) => ({ ...s, [r.id]: r }));
    if (settings.historyEnabled) setHistory((h) => { const next = [r, ...h.filter((x) => x.id !== r.id)]; saveHistory(next); return next; });
  }, [settings.historyEnabled]);

  const value = useMemo<AppState>(() => ({
    slots, updateSlot, connect, disconnect, configFor, target, setTarget, draft, setDraft, history, addResult, session,
    getResult: (id) => session[id] ?? history.find((r) => r.id === id),
    removeResult: (id) => setHistory((h) => { const n = h.filter((r) => r.id !== id); saveHistory(n); return n; }),
    clearHistory: () => { setHistory([]); saveHistory([]); },
    historyEnabled: settings.historyEnabled,
    setHistoryEnabled: (v) => setSettings((s) => ({ ...s, historyEnabled: v })),
    weights: settings.weights,
    setWeights: (w) => setSettings((s) => ({ ...s, weights: w })),
  }), [slots, updateSlot, connect, disconnect, configFor, target, draft, history, addResult, session, settings]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
