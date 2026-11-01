import type { AnalysisResult, ClaimRelation } from "../../engine/types";
import { Badge } from "./ui";

const REL_TONE: Record<ClaimRelation["relation"], "good" | "bad" | "warn" | "info" | "neutral"> = {
  agreement: "good", contradiction: "bad", partial_agreement: "warn", additional_information: "info", insufficient_information: "neutral", uncertain: "neutral",
};
const nice = (s: string) => s.replace(/_/g, " ");

export function PairVerdicts({ result }: { result: AnalysisResult }) {
  const label = (id: string) => result.responses.find((r) => r.id === id)?.label ?? id;
  const tone = { agreement: "good", contradiction: "bad", partial: "warn", no_decisive_evidence: "neutral" } as const;
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Pairwise claim verdicts">
      {result.pairSummaries.map((p) => (
        <li key={`${p.responseAId}-${p.responseBId}`} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <span>{label(p.responseAId)} <span className="text-slate-400">vs</span> {label(p.responseBId)}</span>
          <span className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{p.agreement} agree · {p.partial} partial · {p.contradiction} conflict</span>
            <Badge tone={tone[p.verdict]}>{nice(p.verdict)}</Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ClaimComparison({ result }: { result: AnalysisResult }) {
  const label = (id: string) => result.responses.find((r) => r.id === id)?.label ?? id;
  const claim = (id: string) => result.claims.find((c) => c.id === id);
  const ordered = [...result.relations].sort((a, b) => (a.relation === "contradiction" ? -1 : 0) - (b.relation === "contradiction" ? -1 : 0));
  return (
    <div className="space-y-6">
      {ordered.length === 0 ? (
        <p className="muted">No related claims were found across responses.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="py-2 pr-3">Claim A</th><th className="py-2 pr-3">Claim B</th><th className="py-2 pr-3">Relation</th><th className="py-2">LLM explanation</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {ordered.map((r) => (
                <tr key={`${r.claimAId}-${r.claimBId}`}>
                  <td className="py-2 pr-3"><span className="text-xs font-medium text-slate-500">{label(r.responseAId)}</span><br />{claim(r.claimAId)?.normalizedText}</td>
                  <td className="py-2 pr-3"><span className="text-xs font-medium text-slate-500">{label(r.responseBId)}</span><br />{claim(r.claimBId)?.normalizedText}</td>
                  <td className="py-2 pr-3"><Badge tone={REL_TONE[r.relation]}>{nice(r.relation)}</Badge>{r.confidence !== null && <div className="mt-1 text-xs text-slate-400">conf. {Math.round(r.confidence * 100)}%</div>}</td>
                  <td className="py-2 text-slate-600">{r.explanation || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-medium">All extracted claims ({result.claims.length})</summary>
        <div className="mt-3 space-y-4">
          {result.responses.map((resp) => {
            const list = result.claims.filter((c) => c.responseId === resp.id);
            return (
              <div key={resp.id}>
                <h4 className="text-sm font-semibold">{resp.label} <span className="font-normal text-slate-400">({list.length})</span></h4>
                {list.length === 0 ? <p className="muted">No claims extracted.</p> : (
                  <ul className="mt-1 space-y-2">
                    {list.map((c) => (
                      <li key={c.id} className="rounded-md bg-slate-50 p-2 text-sm">
                        <p><span className="font-mono text-xs text-slate-400">{c.id}</span> {c.normalizedText} {!c.grounded && <Badge tone="warn">not found in response – excluded</Badge>}</p>
                        <p className="text-xs text-slate-500">Original: “{c.originalText}”</p>
                        <p className="text-xs text-slate-500">Subject: {c.subject} · Predicate: {c.predicate} · Object: {c.object ?? "—"}{c.qualifiers.length ? ` · Qualifiers: ${c.qualifiers.join("; ")}` : ""}{c.confidence !== null ? ` · Certainty: ${Math.round(c.confidence * 100)}%` : ""}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}
