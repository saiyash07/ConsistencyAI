import { Link } from "react-router-dom";
import { Download, Eye, Printer, Trash2 } from "lucide-react";
import { Badge, Notice, PageHeader, pct } from "../components/ui";
import { PROVIDER_LABEL } from "../lib/api";
import { downloadReport, printReport } from "../lib/download";
import { useApp } from "../state/AppState";

export default function Reports() {
  const { history, removeResult, historyEnabled } = useApp();
  return (
    <>
      <PageHeader title="Reports" subtitle="Previous evaluations saved in this browser. Reports are self-contained HTML files; use Print → Save as PDF for a PDF." />
      {!historyEnabled && <div className="mb-4"><Notice tone="warn">History saving is turned off in Settings. New evaluations are kept only until you close this tab.</Notice></div>}
      {history.length === 0 ? (
        <div className="card text-center"><p className="text-slate-600">No saved evaluations yet.</p><Link className="btn-primary mt-3" to="/analyze">Run an analysis</Link></div>
      ) : (
        <ul className="space-y-3">
          {history.map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center justify-between gap-3" data-testid="report-row">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.question}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {new Date(r.createdAt).toLocaleString()} · {r.responses.length} responses · {r.provider ? `${PROVIDER_LABEL[r.provider.provider]} (${r.provider.model})` : "Native"}
                  <Badge tone="neutral">overall {pct(r.scores.overall.value)}{r.scores.overall.completeness === "partial" ? " (partial)" : ""}</Badge>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link className="btn-secondary" to={`/results/${r.id}`}><Eye className="h-4 w-4" aria-hidden /> View</Link>
                <button className="btn-secondary" onClick={() => downloadReport(r)}><Download className="h-4 w-4" aria-hidden /> HTML</button>
                <button className="btn-secondary" onClick={() => printReport(r)}><Printer className="h-4 w-4" aria-hidden /> PDF</button>
                <button className="btn-ghost" aria-label="Delete evaluation" onClick={() => removeResult(r.id)}><Trash2 className="h-4 w-4" aria-hidden /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
