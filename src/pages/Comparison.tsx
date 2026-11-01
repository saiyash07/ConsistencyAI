import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Play } from "lucide-react";
import { compareAnalyses } from "../../engine/compare";
import type { ProviderComparison } from "../../engine/compare";
import type { AnalysisResult } from "../../engine/types";
import { EvaluatorSelect, targetLabel } from "../components/EvaluatorSelect";
import { Badge, Notice, PageHeader, pct } from "../components/ui";
import { ResponseForm } from "../components/ResponseForm";
import { analyze, describeError } from "../lib/api";
import { buildRequest } from "../lib/useRunner";
import { DEMO_SCENARIOS } from "../../engine/demo";
import { validateResponses } from "../../engine/validation";
import { newResponseId, useApp } from "../state/AppState";
import type { Target } from "../state/AppState";

interface Outcome { a?: AnalysisResult; b?: AnalysisResult; errA?: string; errB?: string }

export default function Comparison() {
  const { draft, setDraft, slots, configFor, weights, addResult } = useApp();
  const [ta, setTa] = useState<Target>("gemini");
  const [tb, setTb] = useState<Target>("groq");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Outcome | null>(null);
  const [issues, setIssues] = useState<string[]>([]);

  const ready = (t: Target) => t === "native" || slots[t].status === "connected";
  const label = (r: AnalysisResult, id: string) => r.responses.find((x) => x.id === id)?.label ?? id;

  const runOne = async (t: Target): Promise<AnalysisResult> =>
    analyze(buildRequest(draft, t, weights), t === "native" ? null : configFor(t));

  const run = async () => {
    const found = validateResponses(draft.question, draft.responses.map((r) => ({ ...r, text: r.text.trim(), label: r.label.trim() || "Response" })));
    setIssues(found);
    if (found.length) return;
    if (ta === tb) { setIssues(["Choose two different evaluators."]); return; }
    setBusy(true);
    setOut(null);
    const [ra, rb] = await Promise.allSettled([runOne(ta), runOne(tb)]);
    const o: Outcome = {
      a: ra.status === "fulfilled" ? ra.value : undefined, errA: ra.status === "rejected" ? describeError(ra.reason) : undefined,
      b: rb.status === "fulfilled" ? rb.value : undefined, errB: rb.status === "rejected" ? describeError(rb.reason) : undefined,
    };
    if (o.a) addResult(o.a);
    if (o.b) addResult(o.b);
    setOut(o);
    setBusy(false);
  };

  const loadDemo = (id: string) => {
    const s = DEMO_SCENARIOS.find((x) => x.id === id);
    if (s) setDraft({ question: s.question, responses: s.responses.map((r) => ({ id: newResponseId(), ...r })) });
  };

  const cmp: ProviderComparison | null = out?.a && out.b ? compareAnalyses(out.a, out.b) : null;
  const verdictTone = { agreement: "good", contradiction: "bad", partial: "warn", no_decisive_evidence: "neutral" } as const;

  return (
    <>
      <PageHeader title="Provider comparison" subtitle="Run the same responses through two evaluators and see where their judgments differ. Disagreements are shown as-is — neither evaluator is assumed to be right." />
      <div className="space-y-6">
        <section className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="h2">Input</h2>
            <label className="flex items-center gap-2 text-sm">Load demo:
              <select className="input w-auto" defaultValue="" onChange={(e) => e.target.value && loadDemo(e.target.value)} aria-label="Load demo scenario">
                <option value="">Choose…</option>{DEMO_SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </label>
          </div>
          <ResponseForm draft={draft} onChange={setDraft} disabled={busy} />
        </section>
        <section className="card grid gap-6 lg:grid-cols-2">
          <EvaluatorSelect value={ta} onChange={setTa} legend="Evaluator 1" exclude={tb} />
          <EvaluatorSelect value={tb} onChange={setTb} legend="Evaluator 2" exclude={ta} />
        </section>
        {issues.length > 0 && <Notice tone="error" title="Please fix:"><ul className="list-disc pl-5">{issues.map((i) => <li key={i}>{i}</li>)}</ul></Notice>}
        {(!ready(ta) || !ready(tb)) && <Notice tone="warn">Connect both selected providers in <Link className="underline" to="/settings">Settings</Link> first.</Notice>}
        <button className="btn-primary" onClick={run} disabled={busy || !ready(ta) || !ready(tb)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />} {busy ? "Running both evaluators…" : "Run comparison"}
        </button>

        {out && (out.errA || out.errB) && (
          <Notice tone="error" title="One evaluator failed">
            {out.errA && <p>{targetLabel(ta)}: {out.errA}</p>}{out.errB && <p>{targetLabel(tb)}: {out.errB}</p>}
            <p className="mt-1">A comparison needs both evaluators to finish.</p>
          </Notice>
        )}

        {cmp && out?.a && out.b && (
          <div className="space-y-6" data-testid="comparison-report">
            <Notice tone="info" title="Evaluator agreement summary">{cmp.summary}{cmp.verdictAgreementRate !== null && ` Verdict agreement: ${pct(cmp.verdictAgreementRate)}.`}</Notice>

            <section className="card">
              <h2 className="h2">Scores by evaluator</h2>
              <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2">Metric</th><th>{cmp.evaluatorA}</th><th>{cmp.evaluatorB}</th><th>Δ (2 − 1)</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{cmp.scoreDeltas.map((d) => (
                  <tr key={d.metric}><td className="py-2 capitalize">{d.metric}</td><td className="tabular-nums">{d.a === null ? "unavailable" : pct(d.a, 1)}</td><td className="tabular-nums">{d.b === null ? "unavailable" : pct(d.b, 1)}</td><td className="tabular-nums">{d.delta === null ? "—" : `${d.delta > 0 ? "+" : ""}${(d.delta * 100).toFixed(1)} pts`}</td></tr>
                ))}</tbody>
              </table></div>
            </section>

            <section className="card">
              <h2 className="h2">Contradiction detection by pair</h2>
              {cmp.pairs.length === 0 ? <p className="muted mt-2">No comparable pair verdicts (e.g. native mode produces none).</p> : (
                <ul className="mt-3 space-y-2">{cmp.pairs.map((p) => (
                  <li key={`${p.responseAId}${p.responseBId}`} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${p.agree ? "border-slate-200" : "border-amber-300 bg-amber-50/50"}`}>
                    <span>{label(out.a!, p.responseAId)} vs {label(out.a!, p.responseBId)}</span>
                    <span className="flex items-center gap-2"><Badge tone={verdictTone[p.verdictA]}>{p.verdictA.replace(/_/g, " ")}</Badge><span className="text-slate-400">|</span><Badge tone={verdictTone[p.verdictB]}>{p.verdictB.replace(/_/g, " ")}</Badge>{!p.agree && <Badge tone="warn">evaluators differ</Badge>}</span>
                  </li>))}</ul>
              )}
              <p className="mt-2 text-xs text-slate-500">Left badge: {cmp.evaluatorA}. Right badge: {cmp.evaluatorB}.</p>
            </section>

            <section className="card">
              <h2 className="h2">Claim extraction differences</h2>
              <div className="mt-3 space-y-4">{cmp.claimMatches.map((m) => {
                const counts = cmp.claimCounts.find((c) => c.responseId === m.responseId)!;
                return (
                  <div key={m.responseId}>
                    <h3 className="text-sm font-semibold">{label(out.a!, m.responseId)} <span className="font-normal text-slate-500">— {counts.countA} vs {counts.countB} claims, {m.matched.length} matched</span></h3>
                    <div className="mt-2 grid gap-3 md:grid-cols-2 text-sm">
                      <div><p className="text-xs font-medium text-slate-500">Only in {cmp.evaluatorA}</p>{m.onlyA.length ? <ul className="list-disc pl-5">{m.onlyA.map((c) => <li key={c.id}>{c.normalizedText}</li>)}</ul> : <p className="muted">—</p>}</div>
                      <div><p className="text-xs font-medium text-slate-500">Only in {cmp.evaluatorB}</p>{m.onlyB.length ? <ul className="list-disc pl-5">{m.onlyB.map((c) => <li key={c.id}>{c.normalizedText}</li>)}</ul> : <p className="muted">—</p>}</div>
                    </div>
                  </div>);
              })}</div>
            </section>

            <section className="card">
              <h2 className="h2">Side-by-side explanations</h2>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                {[out.a, out.b].map((r, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-3"><p className="text-sm font-medium">{i === 0 ? cmp.evaluatorA : cmp.evaluatorB} <Badge tone={r.explanation.source === "llm" ? "info" : "neutral"}>{r.explanation.source === "llm" ? "LLM" : "rule-generated"}</Badge></p><p className="mt-1 text-sm text-slate-700">{r.explanation.text}</p>
                    <Link className="mt-2 inline-block text-sm text-indigo-700 underline" to={`/results/${r.id}`}>Open full result</Link></div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </>
  );
}
