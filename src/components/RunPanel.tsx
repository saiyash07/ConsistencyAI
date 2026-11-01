import { Loader2, Play } from "lucide-react";
import type { ProviderId } from "../../engine/types";
import { useApp } from "../state/AppState";
import type { Target } from "../state/AppState";
import { EvaluatorSelect } from "./EvaluatorSelect";
import { Notice } from "./ui";
import { PROVIDER_LABEL } from "../lib/api";

/** Analysis-mode selector + provider selector + privacy note. */
export function ModeAndProvider({ target, onChange }: { target: Target; onChange: (t: Target) => void }) {
  const { slots } = useApp();
  const hybrid = target !== "native";
  const pickHybrid = () => {
    const connected = (["gemini", "groq", "ollama"] as ProviderId[]).find((p) => slots[p].status === "connected");
    onChange(connected ?? "gemini");
  };
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="label">Analysis mode</legend>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5" role="radiogroup" aria-label="Analysis mode">
          {([["native", "Native (no AI)"], ["hybrid", "AI-assisted (hybrid)"]] as const).map(([k, text]) => {
            const active = (k === "hybrid") === hybrid;
            return (
              <button key={k} type="button" role="radio" aria-checked={active} onClick={() => (k === "native" ? onChange("native") : pickHybrid())}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                {text}
              </button>
            );
          })}
        </div>
      </fieldset>
      {hybrid ? (
        <>
          <EvaluatorSelect value={target} onChange={onChange} legend="AI provider" includeNative={false} />
          <Notice tone="info" title="Privacy">
            {target === "ollama"
              ? "Your responses are sent only to the Ollama server on your own machine."
              : `Your question and responses are sent through this app's server to ${PROVIDER_LABEL[target as ProviderId]} for evaluation, using your own API key. Keys are not stored or logged.`}
          </Notice>
        </>
      ) : (
        <Notice tone="info">Native analysis runs entirely in your browser. It computes lexical similarity, structure and outliers; it cannot assess meaning or facts.</Notice>
      )}
    </div>
  );
}

export function RunButton({ busy, progress, onClick, label = "Run analysis" }: { busy: boolean; progress: string; onClick: () => void; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn-primary" onClick={onClick} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
        {busy ? "Analysing…" : label}
      </button>
      {busy && <span className="text-sm text-slate-500" role="status">{progress}</span>}
    </div>
  );
}
