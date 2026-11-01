import { Link, useParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, GitCompare, Printer } from "lucide-react";
import { ClaimComparison, PairVerdicts } from "../components/ClaimComparison";
import { Heatmap } from "../components/Heatmap";
import { Badge, MetricCard, Notice, PageHeader, pct, scoreTone } from "../components/ui";
import { PROVIDER_LABEL } from "../lib/api";
import { downloadReport, printReport } from "../lib/download";
import { useApp } from "../state/AppState";

export default function Results() {
  const { id } = useParams();
  const { getResult } = useApp();
  const r = id ? getResult(id) : undefined;
  if (!r) {
    return (
      <>
        <PageHeader title="Result not found" />
        <Notice tone="warn">This analysis is not in memory or saved history. <Link className="underline" to="/analyze">Start a new analysis</Link>.</Notice>
      </>
    );
  }
  const label = (rid: string) => r.responses.find((x) => x.id === rid)?.label ?? rid;
  const s = r.scores;
  const chartData = r.structure.profiles.map((p) => ({ name: label(p.responseId), Words: p.words, "Estimated points": p.estimatedPoints }));
  const evaluator = r.provider ? `${PROVIDER_LABEL[r.provider.provider]} · ${r.provider.model}` : "Native analysis (no AI)";
  const overallTone = scoreTone(s.overall.value);

  return (
    <>
      <PageHeader
        title="Analysis results"
        subtitle={r.question}
        actions={
          <>
            <button className="btn-secondary" onClick={() => downloadReport(r)}><Download className="h-4 w-4" aria-hidden /> Download report</button>
            <button className="btn-secondary" onClick={() => printReport(r)}><Printer className="h-4 w-4" aria-hidden /> Print / PDF</button>
            <Link className="btn-secondary" to="/compare"><GitCompare className="h-4 w-4" aria-hidden /> Compare providers</Link>
          </>
        }
      />
      <p className="-mt-4 mb-6 text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()} · {r.responses.length} responses · Evaluator: {evaluator}</p>

      <div className="space-y-6">
        {/* Overall */}
        <section className="card" aria-labelledby="overall-h">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <h2 id="overall-h" className="text-sm font-medium text-slate-500">Overall consistency indicator</h2>
              <p className="mt-1 text-5xl font-semibold tabular-nums" data-testid="overall-value">{s.overall.value === null ? "—" : pct(s.overall.value)}</p>
              <div className="mt-2 flex gap-2">
                <Badge tone={overallTone}>{s.overall.completeness}</Badge>
                {s.overall.missing.length > 0 && <Badge tone="warn">missing: {s.overall.missing.join(", ")}</Badge>}
              </div>
            </div>
            <div className="min-w-[240px] flex-1 text-sm text-slate-600">
              <p>{s.overall.note}</p>
              <p className="mt-2 text-xs text-slate-500">
                Weights applied (renormalised over available metrics):{" "}
                {Object.entries(s.overall.weightsApplied).map(([k, v]) => `${k} ${Math.round((v ?? 0) * 100)}%`).join(" · ") || "none"}
              </p>
            </div>
          </div>
        </section>

        <section aria-label="Metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Textual similarity" value={s.textual.value} tag="Deterministic" description="TF-IDF cosine over shared vocabulary. Not a measure of meaning." />
          <MetricCard title="Semantic agreement" value={s.semantic.value} tag="LLM-assisted" description="Embedding cosine similarity: do the responses mean similar things?" unavailableReason={s.semantic.reason} />
          <MetricCard title="Claim agreement" value={s.claim.value} tag="LLM-assisted" description="Share of compared claims that agree. Not factual accuracy." unavailableReason={s.claim.reason} />
          <MetricCard title="Structural consistency" value={s.structural.value} tag="Deterministic" description="Length, formatting and requested-item coverage." />
        </section>

        <Section title={`Evaluation explanation`} badge={<Badge tone={r.explanation.source === "llm" ? "info" : "neutral"}>{r.explanation.source === "llm" ? "LLM-generated" : "Rule-generated"}</Badge>}>
          <p className="text-sm leading-relaxed text-slate-700">{r.explanation.text}</p>
          {r.stages.explanation.status === "failed" && <p className="mt-2 text-xs text-amber-700">{r.stages.explanation.reason}</p>}
        </Section>

        {/* Similarity */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Pairwise textual similarity" badge={<Badge>TF-IDF · lexical</Badge>}>
            {r.textualSimilarity && <Heatmap matrix={r.textualSimilarity} responses={r.responses} caption="Pairwise TF-IDF cosine similarity" />}
            <p className="mt-2 text-xs text-slate-500">High values mean shared wording. Paraphrases can score low even when the meaning is identical.</p>
          </Section>
          <Section title="Pairwise semantic similarity" badge={<Badge tone="info">Embeddings</Badge>}>
            {r.semanticSimilarity ? (
              <Heatmap matrix={r.semanticSimilarity} responses={r.responses} caption="Pairwise embedding cosine similarity" />
            ) : (
              <Notice tone="warn" title="Unavailable">{s.semantic.reason} Textual similarity is not substituted.</Notice>
            )}
          </Section>
        </div>

        {/* Claims */}
        <Section title="Agreement and contradiction" badge={<Badge tone="info">{r.mode === "hybrid" ? "LLM-assisted" : "Rule-based only"}</Badge>}>
          {r.stages.claims.status === "ok" && r.stages.contradictions.status !== "failed" ? (
            <div className="space-y-6">
              <PairVerdicts result={r} />
              <ClaimComparison result={r} />
              <p className="text-xs text-slate-500">Contradiction detection finds incompatible claims. It does not establish which claim is correct, and agreement among responses is not evidence of truth.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Notice tone="warn" title="Claim analysis unavailable">{r.stages.claims.reason ?? r.stages.contradictions.reason}</Notice>
            </div>
          )}
          {r.mode === "native" && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold">Rule-based candidate disagreements <Badge tone="warn">unverified</Badge></h3>
              {r.ruleBasedFlags.length === 0 ? <p className="muted mt-1">No candidates found by the rule-based checks.</p> : (
                <ul className="mt-2 space-y-2">
                  {r.ruleBasedFlags.map((f, i) => (
                    <li key={i} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-sm">
                      <p className="font-medium">{label(f.responseAId)} vs {label(f.responseBId)}</p>
                      <p className="text-slate-700">“{f.sentenceA}” ↔ “{f.sentenceB}”</p>
                      <p className="text-xs text-slate-500">{f.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-slate-500">These are pattern matches for human review. Connect an AI provider for real claim extraction.</p>
            </div>
          )}
        </Section>

        {/* Structure */}
        <Section title="Structural differences" badge={<Badge>Deterministic</Badge>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500"><tr>{["Response", "Words", "Sentences", "Paragraphs", "Format", "Est. points"].map((h) => <th key={h} className="py-2 pr-3">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {r.structure.profiles.map((p) => (
                  <tr key={p.responseId}>
                    <td className="py-2 pr-3 font-medium">{label(p.responseId)}</td><td className="pr-3 tabular-nums">{p.words}</td><td className="pr-3 tabular-nums">{p.sentences}</td><td className="pr-3 tabular-nums">{p.paragraphs}</td>
                    <td className="pr-3">{[p.hasHeading && "heading", p.hasNumberedList && "numbered list", p.hasBullets && "bullets"].filter(Boolean).join(", ") || "plain prose"}</td>
                    <td className="pr-3 tabular-nums">{p.estimatedPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 h-56" aria-label="Chart of words and estimated points per response" role="img">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Words" fill="#3730a3" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="Estimated points" fill="#94a3b8" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {r.structure.requested.count !== null && <p className="mt-3 text-sm text-slate-600">The question requests <strong>{r.structure.requested.count} {r.structure.requested.noun}</strong>. Point counts are heuristic estimates.</p>}
          <ul className="mt-3 space-y-1.5">
            {r.structure.findings.length === 0 ? <li className="muted">No structural issues detected.</li> : r.structure.findings.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm"><Badge tone={f.severity === "warning" ? "warn" : "neutral"}>{f.severity}</Badge><span>{f.message}</span></li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Structural variation is not the same as factual inconsistency.</p>
        </Section>

        {/* Outliers */}
        <Section title="Outlier responses">
          <p className="muted mb-3">{r.outliers.note}</p>
          {r.outliers.applicable && (
            <ul className="space-y-2">
              {r.outliers.results.map((o) => (
                <li key={o.responseId} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{label(o.responseId)}</span>
                    <span className="flex items-center gap-2">{o.distance !== null && <span className="text-xs text-slate-500">distance {o.distance.toFixed(2)}</span>}<Badge tone={o.isOutlier ? "warn" : "good"}>{o.isOutlier ? "outlier" : "in line with others"}</Badge></span>
                  </div>
                  {o.reasons.length > 0 && <ul className="mt-1 list-disc pl-5 text-slate-600">{o.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Pipeline & limitations */}
        <Section title="Pipeline status">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(r.stages).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="capitalize">{k}</span>
                <Badge tone={v.status === "ok" ? "good" : v.status === "failed" ? "bad" : v.status === "unavailable" ? "warn" : "neutral"}>{v.status}</Badge>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Limitations and uncertainty">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {r.limitations.map((l) => <li key={l}>{l}</li>)}
            {r.warnings.map((w) => <li key={w} className="text-amber-800">{w}</li>)}
          </ul>
        </Section>
      </div>
    </>
  );
}

function Section({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="h2">{title}</h2>{badge}</div>
      {children}
    </section>
  );
}
