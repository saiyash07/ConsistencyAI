import { Plus, Trash2 } from "lucide-react";
import { LIMITS } from "../../engine/types";
import { labelFor, newResponseId } from "../state/AppState";
import type { Draft } from "../state/AppState";

export function ResponseForm({ draft, onChange, disabled }: { draft: Draft; onChange: (d: Draft) => void; disabled?: boolean }) {
  const setResp = (id: string, patch: Partial<Draft["responses"][number]>) =>
    onChange({ ...draft, responses: draft.responses.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const add = () => {
    if (draft.responses.length >= LIMITS.maxResponses) return;
    onChange({ ...draft, responses: [...draft.responses, { id: newResponseId(), label: labelFor(draft.responses.length), text: "" }] });
  };
  const remove = (id: string) => {
    if (draft.responses.length <= LIMITS.minResponses) return;
    onChange({ ...draft, responses: draft.responses.filter((r) => r.id !== id) });
  };
  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="question" className="label">Original question or prompt</label>
        <textarea
          id="question" className="input min-h-[84px]" disabled={disabled} maxLength={LIMITS.maxQuestionChars + 200}
          placeholder="e.g. What is the capital of Australia?"
          value={draft.question} onChange={(e) => onChange({ ...draft, question: e.target.value })}
        />
        <p className="mt-1 text-xs text-slate-400">{draft.question.length}/{LIMITS.maxQuestionChars}</p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="h2">Responses <span className="font-normal text-slate-500">({draft.responses.length} of {LIMITS.minResponses}–{LIMITS.maxResponses})</span></h2>
          <button type="button" className="btn-secondary" onClick={add} disabled={disabled || draft.responses.length >= LIMITS.maxResponses}>
            <Plus className="h-4 w-4" aria-hidden /> Add response
          </button>
        </div>
        {draft.responses.map((r, i) => (
          <div key={r.id} className="rounded-lg border border-slate-200 bg-white p-4" data-testid="response-card">
            <div className="mb-2 flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor={`label-${r.id}`} className="label">Label</label>
                <input id={`label-${r.id}`} className="input max-w-xs" disabled={disabled} maxLength={LIMITS.maxLabelChars} value={r.label} onChange={(e) => setResp(r.id, { label: e.target.value })} />
              </div>
              <button type="button" className="btn-ghost" aria-label={`Remove ${r.label || `response ${i + 1}`}`} onClick={() => remove(r.id)} disabled={disabled || draft.responses.length <= LIMITS.minResponses}>
                <Trash2 className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Remove</span>
              </button>
            </div>
            <label htmlFor={`text-${r.id}`} className="label">Response text</label>
            <textarea
              id={`text-${r.id}`} className="input min-h-[96px]" disabled={disabled} maxLength={LIMITS.maxResponseChars + 500}
              placeholder="Paste an AI-generated answer to the question…"
              value={r.text} onChange={(e) => setResp(r.id, { text: e.target.value })}
            />
            <p className={`mt-1 text-xs ${r.text.length > LIMITS.maxResponseChars ? "text-red-600" : "text-slate-400"}`}>{r.text.length}/{LIMITS.maxResponseChars}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
