import { useNavigate } from "react-router-dom";
import { ResponseForm } from "../components/ResponseForm";
import { ModeAndProvider, RunButton } from "../components/RunPanel";
import { Notice, PageHeader } from "../components/ui";
import { useRunner } from "../lib/useRunner";
import { emptyDraft, useApp } from "../state/AppState";

export default function NewAnalysis() {
  const { draft, setDraft, target, setTarget, addResult } = useApp();
  const { run, busy, progress, error, issues } = useRunner();
  const nav = useNavigate();

  const submit = async () => {
    const result = await run(draft, target);
    if (result) {
      addResult(result);
      nav(`/results/${result.id}`);
    }
  };

  return (
    <>
      <PageHeader
        title="New analysis"
        subtitle="Enter the original question and between 2 and 10 AI-generated responses. The engine analyses exactly what you submit."
        actions={<button className="btn-secondary" onClick={() => setDraft(emptyDraft())} disabled={busy}>Clear form</button>}
      />
      <div className="space-y-6">
        <section className="card"><ResponseForm draft={draft} onChange={setDraft} disabled={busy} /></section>
        <section className="card space-y-4">
          <h2 className="h2">Evaluation settings</h2>
          <ModeAndProvider target={target} onChange={setTarget} />
        </section>
        {issues.length > 0 && (
          <Notice tone="error" title="Please fix the following:">
            <ul className="list-disc pl-5">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
          </Notice>
        )}
        {error && <Notice tone="error" title="Analysis failed">{error}</Notice>}
        <RunButton busy={busy} progress={progress} onClick={submit} />
      </div>
    </>
  );
}
