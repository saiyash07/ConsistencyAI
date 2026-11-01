import type { AnalysisResult } from "./types";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pct = (v: number | null) => (v === null ? "unavailable" : `${(v * 100).toFixed(1)}%`);

function matrixTable(r: AnalysisResult, m: AnalysisResult["textualSimilarity"]): string {
  if (!m) return "<p><em>Unavailable.</em></p>";
  const label = (id: string) => r.responses.find((x) => x.id === id)?.label ?? id;
  return `<table><thead><tr><th></th>${m.ids.map((id) => `<th>${esc(label(id))}</th>`).join("")}</tr></thead><tbody>${m.values
    .map((row, i) => `<tr><th>${esc(label(m.ids[i]))}</th>${row.map((v) => `<td>${v.toFixed(2)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

/** Self-contained printable HTML report. Contains no credentials by construction (results never hold keys). */
export function buildReportHtml(r: AnalysisResult): string {
  const label = (id: string) => esc(r.responses.find((x) => x.id === id)?.label ?? id);
  const claimText = (id: string) => esc(r.claims.find((c) => c.id === id)?.normalizedText ?? id);
  const s = r.scores;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Consistency AI report</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;max-width:880px;margin:32px auto;padding:0 20px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13px}th,td{border:1px solid #e2e8f0;padding:5px 8px;text-align:left;vertical-align:top}
th{background:#f8fafc}.muted{color:#64748b}.box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px 12px;white-space:pre-wrap}
.tag{display:inline-block;font-size:11px;padding:1px 6px;border-radius:4px;background:#e2e8f0}.bad{background:#fee2e2}.good{background:#dcfce7}
@media print{body{margin:0}}
</style></head><body>
<h1>Consistency AI — Evaluation report</h1>
<p class="muted">Generated ${esc(new Date(r.createdAt).toLocaleString())} · Mode: ${esc(r.mode)} · Evaluator: ${r.provider ? esc(`${r.provider.provider} / ${r.provider.model}`) : "none (native analysis)"}</p>
<h2>1. Original question</h2><div class="box">${esc(r.question)}</div>
<h2>2. Submitted responses</h2>
${r.responses.map((x) => `<p><strong>${esc(x.label)}</strong></p><div class="box">${esc(x.text)}</div>`).join("")}
<h2>3. Consistency metrics</h2>
<table><tr><th>Metric</th><th>Value</th><th>Method</th></tr>
<tr><td>Textual similarity</td><td>${pct(s.textual.value)}</td><td>${esc(s.textual.method)}</td></tr>
<tr><td>Semantic agreement</td><td>${pct(s.semantic.value)}${s.semantic.reason ? `<br><span class="muted">${esc(s.semantic.reason)}</span>` : ""}</td><td>${esc(s.semantic.method)}</td></tr>
<tr><td>Claim agreement</td><td>${pct(s.claim.value)}${s.claim.reason ? `<br><span class="muted">${esc(s.claim.reason)}</span>` : ""}</td><td>${esc(s.claim.method)}</td></tr>
<tr><td>Structural consistency</td><td>${pct(s.structural.value)}</td><td>${esc(s.structural.method)}</td></tr>
<tr><th>Overall (${esc(s.overall.completeness)})</th><th>${pct(s.overall.value)}</th><th>${esc(s.overall.note)}</th></tr></table>
<p class="muted">Weights applied: ${esc(JSON.stringify(s.overall.weightsApplied))}</p>
<h2>4. Textual similarity (TF-IDF cosine — lexical, not semantic)</h2>${matrixTable(r, r.textualSimilarity)}
<h2>5. Semantic similarity (embeddings)</h2>${r.semanticSimilarity ? matrixTable(r, r.semanticSimilarity) : `<p><em>Unavailable: ${esc(s.semantic.reason ?? "")}</em></p>`}
<h2>6. Extracted claims</h2>
${r.claims.length ? `<table><tr><th>ID</th><th>Response</th><th>Original</th><th>Normalized</th><th>Subject / predicate / object</th><th>Qualifiers</th></tr>${r.claims
    .map((c) => `<tr><td>${esc(c.id)}</td><td>${label(c.responseId)}</td><td>${esc(c.originalText)}${c.grounded ? "" : ' <span class="tag bad">not grounded</span>'}</td><td>${esc(c.normalizedText)}</td><td>${esc(c.subject)} / ${esc(c.predicate)} / ${esc(c.object ?? "—")}</td><td>${esc(c.qualifiers.join("; "))}</td></tr>`)
    .join("")}</table>` : `<p><em>No claims were extracted (${esc(r.stages.claims.reason ?? "not run")}).</em></p>`}
<h2>7. Contradiction &amp; agreement analysis</h2>
${r.relations.length ? `<table><tr><th>Claim A</th><th>Claim B</th><th>Relation</th><th>Explanation (LLM)</th></tr>${r.relations
    .map((x) => `<tr><td>${label(x.responseAId)}: ${claimText(x.claimAId)}</td><td>${label(x.responseBId)}: ${claimText(x.claimBId)}</td><td><span class="tag ${x.relation === "contradiction" ? "bad" : x.relation === "agreement" ? "good" : ""}">${esc(x.relation.replace(/_/g, " "))}</span></td><td>${esc(x.explanation)}</td></tr>`)
    .join("")}</table>` : "<p><em>No claim relations available.</em></p>"}
${r.ruleBasedFlags.length ? `<p><strong>Rule-based candidate disagreements (unverified):</strong></p><table><tr><th>Responses</th><th>Sentences</th><th>Reason</th></tr>${r.ruleBasedFlags
    .map((f) => `<tr><td>${label(f.responseAId)} vs ${label(f.responseBId)}</td><td>“${esc(f.sentenceA)}”<br>“${esc(f.sentenceB)}”</td><td>${esc(f.detail)}</td></tr>`)
    .join("")}</table>` : ""}
<p class="muted">Contradiction detection finds incompatible claims. It does not establish which claim is true, and agreement among responses is not evidence of truth.</p>
<h2>8. Structural comparison</h2>
<table><tr><th>Response</th><th>Words</th><th>Sentences</th><th>Paragraphs</th><th>Heading</th><th>Bullets</th><th>Numbered</th><th>Est. points</th></tr>${r.structure.profiles
    .map((p) => `<tr><td>${label(p.responseId)}</td><td>${p.words}</td><td>${p.sentences}</td><td>${p.paragraphs}</td><td>${p.hasHeading ? "yes" : "no"}</td><td>${p.hasBullets ? "yes" : "no"}</td><td>${p.hasNumberedList ? "yes" : "no"}</td><td>${p.estimatedPoints}</td></tr>`)
    .join("")}</table>
<ul>${r.structure.findings.map((f) => `<li>${esc(f.message)}</li>`).join("") || "<li>No structural findings.</li>"}</ul>
<h2>9. Outlier analysis</h2>
<p class="muted">${esc(r.outliers.note ?? "")}</p>
<ul>${r.outliers.results.filter((o) => o.isOutlier).map((o) => `<li><strong>${label(o.responseId)}</strong>: ${o.reasons.map(esc).join(" ")}</li>`).join("") || "<li>No outliers detected.</li>"}</ul>
<h2>10. Evaluation explanation (${r.explanation.source === "llm" ? "LLM-generated" : "rule-generated"})</h2><div class="box">${esc(r.explanation.text)}</div>
<h2>11. Limitations</h2><ul>${[...r.limitations, ...r.warnings].map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
<p class="muted">Report ID ${esc(r.id)} · API keys are never stored in or exported with reports.</p>
</body></html>`;
}
