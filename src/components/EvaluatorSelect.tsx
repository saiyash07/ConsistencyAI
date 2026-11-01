import { Link } from "react-router-dom";
import type { ProviderId } from "../../engine/types";
import { PROVIDER_LABEL } from "../lib/api";
import { useApp } from "../state/AppState";
import type { Target } from "../state/AppState";
import { Badge } from "./ui";

export function targetLabel(t: Target, model?: string) {
  return t === "native" ? "Native analysis (no AI)" : `${PROVIDER_LABEL[t]}${model ? ` · ${model}` : ""}`;
}

/** Radio-style selector for the evaluator; shows connection state of each provider. */
export function EvaluatorSelect({ value, onChange, legend = "Evaluator", exclude, includeNative = true }: { value: Target; onChange: (t: Target) => void; legend?: string; exclude?: Target; includeNative?: boolean }) {
  const { slots } = useApp();
  const options: Target[] = (["native", "gemini", "groq", "ollama"] as Target[]).filter((t) => t !== exclude && (includeNative || t !== "native"));
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((t) => {
          const connected = t === "native" || slots[t as ProviderId].status === "connected";
          const checked = value === t;
          return (
            <label key={t} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${checked ? "border-indigo-500 bg-indigo-50/50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
              <input type="radio" name={`evaluator-${legend}`} className="mt-1" checked={checked} onChange={() => onChange(t)} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                  {t === "native" ? "Native analysis" : PROVIDER_LABEL[t as ProviderId]}
                  {t === "native" ? <Badge>No AI · always available</Badge> : connected ? <Badge tone="good">Connected</Badge> : <Badge tone="warn">Not connected</Badge>}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {t === "native"
                    ? "TF-IDF, structure, outliers and rule-based checks. Runs in your browser."
                    : connected
                      ? slots[t as ProviderId].model || "No model selected"
                      : <>Add credentials in <Link className="text-indigo-700 underline" to="/settings">Settings</Link>.</>}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
