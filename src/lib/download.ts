import { buildReportHtml } from "../../engine/report";
import type { AnalysisResult } from "../../engine/types";

export function reportFileName(r: AnalysisResult): string {
  return `consistency-ai-report-${r.createdAt.slice(0, 19).replace(/[:T]/g, "-")}.html`;
}

/** Download the self-contained HTML report (no credentials are ever part of a result). */
export function downloadReport(r: AnalysisResult): void {
  const blob = new Blob([buildReportHtml(r)], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = reportFileName(r);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Print the report (choose "Save as PDF" in the print dialog). Uses a hidden iframe to avoid popup blockers. */
export function printReport(r: AnalysisResult): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.srcdoc = buildReportHtml(r);
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 2000);
  };
  document.body.appendChild(frame);
}
