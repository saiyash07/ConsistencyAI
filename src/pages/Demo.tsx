import { useNavigate } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { DEMO_SCENARIOS } from "../../engine/demo";
import { ModeAndProvider, RunButton } from "../components/RunPanel";
import { Notice, PageHeader } from "../components/ui";
import { useRunner } from "../lib/useRunner";
import { newResponseId, useApp } from "../state/AppState";
import type { Draft } from "../state/AppState";

const toDraft = (id: string): Draft => {
  const s = DEMO_SCENARIOS.find((x) => x.id === id)!;
  return { question: s.question, responses: s.responses.map((r) => ({ id: newResponseId(), ...r })) };
};

export default function Demo() {
  const { setDraft, target, setTarget, addResult } = useApp();
  const { run, busy, progress, error } = useRunner();
  const nav = useNavigate();

  const load = (id: string) => { setDraft(toDraft(id)); nav("/analyze"); };
  const runNow = async (id: string) => {
    const d = toDraft(id);
    setDraft(d);
    const result = await run(d, target);
    if (result) { addResult(result); nav(`/results/${result.id}`); }
  };

  return (
    <>
      <PageHeader title="Demo playground" subtitle="Three ready-made scenarios. They only fill in sample inputs — every result is computed by the real engine, nothing is pre-written." />
      <div className="mb-6 card space-y-4">
        <h2 className="h2">Evaluate with</h2>
        <ModeAndProvider target={target} onChange={setTarget} />
      </div>
      {error && <div className="mb-4"><Notice tone="error" title="Analysis failed">{error}</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-3">
        {DEMO_SCENARIOS.map((s) => (
          <article key={s.id} className="card flex flex-col" data-testid={`scenario-${s.id}`}>
            <FlaskConical className="h-5 w-5 text-indigo-700" aria-hidden />
            <h3 className="mt-2 font-semibold">{s.title}</h3>
            <p className="text-xs text-slate-500">{s.focus}</p>
            <p className="mt-3 text-sm font-medium text-slate-800">{s.question}</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {s.responses.map((r) => <li key={r.label}><span className="font-medium">{r.label}:</span> {r.text.replace(/\n+/g, " ").slice(0, 90)}{r.text.length > 90 ? "…" : ""}</li>)}
            </ul>
            <p className="mt-3 text-xs text-slate-500"><span className="font-medium">What to look for:</span> {s.expectation}</p>
            <div className="mt-auto flex flex-wrap gap-2 pt-4">
              <button className="btn-secondary" onClick={() => load(s.id)} disabled={busy}>Load into form</button>
            </div>
            <div className="pt-3"><RunButton busy={busy} progress={progress} onClick={() => runNow(s.id)} label="Load & run" /></div>
          </article>
        ))}
      </div>
    </>
  );
}
