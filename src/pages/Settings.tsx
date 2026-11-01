import { useState } from "react";
import { CheckCircle2, Loader2, PlugZap, Unplug } from "lucide-react";
import type { ScoreWeights } from "../../engine/types";
import { DEFAULT_WEIGHTS } from "../../engine/types";
import { Badge, Notice, PageHeader } from "../components/ui";
import { PROVIDER_LABEL } from "../lib/api";
import { useApp } from "../state/AppState";

const HELP: Record<"gemini" | "groq", { url: string; text: string; embeddings: string }> = {
  gemini: { url: "https://aistudio.google.com/apikey", text: "Create a free key in Google AI Studio.", embeddings: "Supports embeddings → semantic analysis available." },
  groq: { url: "https://console.groq.com/keys", text: "Create a free key in the Groq console.", embeddings: "Groq has no embeddings API → semantic analysis is reported as unavailable." },
};

function StatusBadge({ status }: { status: string }) {
  return status === "connected" ? <Badge tone="good">Connected</Badge> : status === "testing" ? <Badge tone="info">Testing…</Badge> : status === "error" ? <Badge tone="bad">Error</Badge> : <Badge>Not connected</Badge>;
}

function CloudCard({ id }: { id: "gemini" | "groq" }) {
  const { slots, updateSlot, connect, disconnect } = useApp();
  const s = slots[id];
  const connected = s.status === "connected";
  const inputId = `${id}-key`;
  return (
    <section className="card" aria-labelledby={`${id}-h`}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${id}-h`} className="h2">{PROVIDER_LABEL[id]}</h2><StatusBadge status={s.status} />
      </div>
      <p className="muted mt-1">{HELP[id].text} <a className="text-indigo-700 underline" href={HELP[id].url} target="_blank" rel="noreferrer">Get a key</a>. {HELP[id].embeddings}</p>
      <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void connect(id); }} autoComplete="off">
        <div>
          <label htmlFor={inputId} className="label">API key</label>
          <input id={inputId} type="password" autoComplete="off" spellCheck={false} className="input font-mono" placeholder={connected ? "••••••••••••" : "Paste your key"}
            value={s.apiKey} disabled={connected} onChange={(e) => updateSlot(id, { apiKey: e.target.value })} />
          <p className="mt-1 text-xs text-slate-500">Kept in this tab's memory only. Never saved to storage, never logged. Cleared on disconnect, refresh or closing the tab.</p>
        </div>
        {connected && (
          <div>
            <label htmlFor={`${id}-model`} className="label">Model</label>
            <select id={`${id}-model`} className="input" value={s.model} onChange={(e) => updateSlot(id, { model: e.target.value })}>
              {!s.models.includes(s.model) && <option value={s.model}>{s.model}</option>}
              {s.models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        )}
        {s.error && <Notice tone="error" title="Connection failed">{s.error}</Notice>}
        {connected && <Notice tone="success">Key verified. {s.models.length} models available.{s.supportsEmbeddings ? " Embeddings supported." : " No embeddings support."}</Notice>}
        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <button type="submit" className="btn-primary" disabled={s.status === "testing" || s.apiKey.trim().length < 8}>
              {s.status === "testing" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlugZap className="h-4 w-4" aria-hidden />} Test connection
            </button>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={() => void connect(id)}><CheckCircle2 className="h-4 w-4" aria-hidden /> Re-test</button>
              <button type="button" className="btn-danger" onClick={() => disconnect(id)}><Unplug className="h-4 w-4" aria-hidden /> Disconnect</button>
            </>
          )}
        </div>
      </form>
    </section>
  );
}

function OllamaCard() {
  const { slots, updateSlot, connect, disconnect } = useApp();
  const s = slots.ollama;
  const connected = s.status === "connected";
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-app.vercel.app";
  return (
    <section className="card" aria-labelledby="ollama-h">
      <div className="flex items-center justify-between gap-2"><h2 id="ollama-h" className="h2">Ollama (local, optional)</h2><StatusBadge status={s.status} /></div>
      <p className="muted mt-1">Runs models on your own computer. Your browser talks to Ollama directly — the hosted server cannot reach your localhost, and your text never leaves your machine.</p>
      <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void connect("ollama"); }}>
        <div>
          <label htmlFor="ollama-url" className="label">Ollama server address</label>
          <input id="ollama-url" className="input font-mono" value={s.baseUrl} disabled={connected} onChange={(e) => updateSlot("ollama", { baseUrl: e.target.value })} />
        </div>
        {connected && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ollama-model" className="label">Chat model (installed)</label>
              <select id="ollama-model" className="input" value={s.model} onChange={(e) => updateSlot("ollama", { model: e.target.value })}>
                {s.models.filter((m) => !/embed/i.test(m)).map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ollama-embed" className="label">Embedding model</label>
              <select id="ollama-embed" className="input" value={s.embeddingModel} onChange={(e) => updateSlot("ollama", { embeddingModel: e.target.value })}>
                <option value="">None (semantic analysis unavailable)</option>
                {s.models.filter((m) => /embed/i.test(m)).map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
        )}
        {s.error && <Notice tone={connected ? "warn" : "error"} title={connected ? "Check models" : "Could not connect"}>{s.error}</Notice>}
        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <button type="submit" className="btn-primary" disabled={s.status === "testing"}>{s.status === "testing" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlugZap className="h-4 w-4" aria-hidden />} Test connection</button>
          ) : (
            <>
              <button type="button" className="btn-secondary" onClick={() => void connect("ollama")}>Re-detect models</button>
              <button type="button" className="btn-danger" onClick={() => disconnect("ollama")}><Unplug className="h-4 w-4" aria-hidden /> Disconnect</button>
            </>
          )}
        </div>
      </form>
      <details className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
        <summary className="cursor-pointer font-medium">Setup instructions</summary>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-slate-700">
          <li>Install Ollama from ollama.com and pull models: <code className="rounded bg-slate-100 px-1">ollama pull llama3.2</code> and <code className="rounded bg-slate-100 px-1">ollama pull nomic-embed-text</code>.</li>
          <li>Allow this site to call your local server (CORS). Quit Ollama, then start it with:
            <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 text-xs text-slate-100">OLLAMA_ORIGINS="{origin}" ollama serve</pre>
            On macOS app installs use <code className="rounded bg-slate-100 px-1">launchctl setenv OLLAMA_ORIGINS "{origin}"</code> then restart Ollama.</li>
          <li>Use Chrome, Edge or Firefox. Chrome may ask permission to access local network devices — allow it. Safari blocks http://localhost from https pages.</li>
          <li>Click “Test connection”. If it fails, you can still use Native analysis, Gemini or Groq.</li>
        </ol>
      </details>
    </section>
  );
}

function WeightsCard() {
  const { weights, setWeights } = useApp();
  const keys: Array<[keyof ScoreWeights, string]> = [["textual", "Textual similarity"], ["semantic", "Semantic agreement"], ["claim", "Claim agreement"], ["structural", "Structural consistency"]];
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  return (
    <section className="card" aria-labelledby="w-h">
      <h2 id="w-h" className="h2">Scoring weights</h2>
      <p className="muted mt-1">Overall = Σ wₖ·mₖ / Σ wₖ over the metrics that are <em>available</em>. Unavailable metrics are excluded, never counted as zero.</p>
      <div className="mt-4 space-y-3">
        {keys.map(([k, name]) => (
          <div key={k} className="grid grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[200px_1fr_56px]">
            <label htmlFor={`w-${k}`} className="text-sm font-medium text-slate-700">{name}</label>
            <input id={`w-${k}`} type="range" min={0} max={1} step={0.05} className="col-span-2 sm:col-span-1" value={weights[k]} onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })} />
            <span className="text-right text-sm tabular-nums text-slate-600">{Math.round((weights[k] / total) * 100)}%</span>
          </div>
        ))}
      </div>
      <button className="btn-secondary mt-4" onClick={() => setWeights(DEFAULT_WEIGHTS)}>Reset to defaults</button>
    </section>
  );
}

export default function SettingsPage() {
  const { historyEnabled, setHistoryEnabled, clearHistory, history } = useApp();
  const [cleared, setCleared] = useState(false);
  return (
    <>
      <PageHeader title="Settings" subtitle="Connect an AI provider (optional), tune scoring, and review how your data is handled." />
      <div className="space-y-6">
        <Notice tone="info" title="Bring your own key">
          Consistency AI never ships with shared credentials. You supply your own Gemini or Groq key, which is held in browser memory for this session only.
        </Notice>
        <div className="grid gap-6 lg:grid-cols-2"><CloudCard id="gemini" /><CloudCard id="groq" /></div>
        <OllamaCard />
        <WeightsCard />
        <section className="card" aria-labelledby="priv-h">
          <h2 id="priv-h" className="h2">Privacy</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            <li><strong>API keys</strong> live in memory only: not in localStorage/sessionStorage, not in a database, not in logs, not in exported reports. They are sent over HTTPS to this app's backend only to call your chosen provider, and are cleared on Disconnect.</li>
            <li><strong>Your question and responses</strong> are transmitted to the provider you select (Gemini or Groq) for LLM-assisted evaluation, under that provider's terms. Native analysis and Ollama keep text on your device.</li>
            <li><strong>No analytics</strong> or third-party tracking is included.</li>
            <li><strong>Saved evaluations</strong> (results only) are stored in this browser's localStorage if history is enabled.</li>
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={historyEnabled} onChange={(e) => setHistoryEnabled(e.target.checked)} /> Save evaluation history in this browser</label>
            <button className="btn-danger" disabled={history.length === 0} onClick={() => { clearHistory(); setCleared(true); }}>Delete saved history ({history.length})</button>
            {cleared && <span role="status" className="text-sm text-emerald-700">History deleted.</span>}
          </div>
        </section>
      </div>
    </>
  );
}
