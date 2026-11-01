import { Link } from "react-router-dom";
import { ArrowRight, FlaskConical, GitCompare, PlayCircle } from "lucide-react";
import type { ProviderId } from "../../engine/types";
import { Badge, PageHeader, pct } from "../components/ui";
import { PROVIDER_LABEL } from "../lib/api";
import { useApp } from "../state/AppState";

export default function Dashboard() {
  const { history, slots } = useApp();
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your evaluations and provider status. Everything shown here comes from analyses you have run." />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card"><p className="text-sm text-slate-500">Saved evaluations</p><p className="mt-1 text-3xl font-semibold tabular-nums" data-testid="total-evals">{history.length}</p><p className="mt-1 text-xs text-slate-400">In this browser only</p></div>
        <div className="card md:col-span-2">
          <p className="text-sm text-slate-500">Provider status</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            <li className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">Native analysis <Badge tone="good">Always available</Badge></li>
            {(["gemini", "groq", "ollama"] as ProviderId[]).map((p) => (
              <li key={p} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">{PROVIDER_LABEL[p]}
                {slots[p].status === "connected" ? <Badge tone="good">Connected</Badge> : <Badge>Not connected</Badge>}</li>
            ))}
          </ul>
        </div>
      </div>

      <h2 className="h2 mb-3 mt-8">Quick actions</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { to: "/analyze", icon: PlayCircle, t: "New analysis", d: "Compare 2–10 responses to one question." },
          { to: "/demo", icon: FlaskConical, t: "Demo playground", d: "Try three prepared scenarios." },
          { to: "/compare", icon: GitCompare, t: "Provider comparison", d: "See how two evaluators judge the same responses." },
        ].map(({ to, icon: Icon, t, d }) => (
          <Link key={to} to={to} className="card group hover:border-slate-300">
            <Icon className="h-5 w-5 text-indigo-700" aria-hidden />
            <p className="mt-2 font-medium">{t}</p><p className="muted">{d}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm text-indigo-700">Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
          </Link>
        ))}
      </div>

      <h2 className="h2 mb-3 mt-8">Recent evaluations</h2>
      {history.length === 0 ? (
        <p className="card muted">No evaluations yet. Run one to see it here.</p>
      ) : (
        <ul className="space-y-2">
          {history.slice(0, 5).map((r) => (
            <li key={r.id}>
              <Link to={`/results/${r.id}`} className="card flex items-center justify-between gap-3 hover:border-slate-300">
                <span className="truncate text-sm font-medium">{r.question}</span>
                <span className="shrink-0 text-xs text-slate-500">{pct(r.scores.overall.value)} · {new Date(r.createdAt).toLocaleDateString()}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="h2 mb-3 mt-8">What the engine does</h2>
      <ul className="grid gap-3 text-sm text-slate-700 md:grid-cols-2">
        {[
          ["Textual similarity", "TF-IDF + cosine over every response pair."],
          ["Semantic similarity", "Embedding cosine when a provider offers embeddings."],
          ["Claims & contradictions", "LLM extracts atomic claims, then compares them across responses."],
          ["Structure & outliers", "Length, format, requested-item coverage, robust outlier tests."],
        ].map(([t, d]) => <li key={t} className="card"><p className="font-medium">{t}</p><p className="muted">{d}</p></li>)}
      </ul>
    </>
  );
}
