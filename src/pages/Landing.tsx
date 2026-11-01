import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Layers, ShieldCheck, Sigma } from "lucide-react";

const STEPS = [
  ["Textual similarity", "Normalise text, build TF-IDF vectors and compare every pair with cosine similarity. Clearly lexical, not semantic."],
  ["Semantic similarity", "Compare embedding vectors to see whether different wording carries the same meaning. Marked unavailable when no embedding model exists."],
  ["Claims & contradictions", "An LLM extracts atomic claims and classifies how claims from different responses relate. It finds conflicts; it does not decide who is right."],
  ["Structure & outliers", "Length, formatting and requested-item coverage, plus robust statistics to explain which responses stand apart."],
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <span className="flex items-center gap-2 text-lg font-semibold"><BarChart3 className="h-5 w-5" aria-hidden /> Consistency AI</span>
        <nav aria-label="Primary" className="flex items-center gap-2"><Link className="btn-ghost" to="/demo">Demo</Link><Link className="btn-secondary" to="/dashboard">Dashboard</Link></nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <section className="py-12 sm:py-16">
          <p className="text-sm font-medium text-indigo-700">AI Tools &amp; Prompt Engineering · Mini project</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Do your AI answers actually agree with each other?</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-slate-600">
            Paste several AI-generated answers to the same question. Consistency AI measures where they agree, where they contradict, how their structure differs and which ones stand out — with an explanation for every result.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/analyze" className="btn-primary px-5 py-2.5 text-base">Start analysis <ArrowRight className="h-4 w-4" aria-hidden /></Link>
            <Link to="/demo" className="btn-secondary px-5 py-2.5 text-base">Try a demo scenario</Link>
          </div>
        </section>

        <section aria-labelledby="how" className="py-6">
          <h2 id="how" className="text-xl font-semibold">How the evaluation works</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {STEPS.map(([t, d], i) => (
              <div key={t} className="card"><p className="text-xs font-medium text-slate-400">Step {i + 1}</p><h3 className="mt-1 font-semibold">{t}</h3><p className="mt-1 text-sm text-slate-600">{d}</p></div>
            ))}
          </div>
        </section>

        <section aria-labelledby="prov" className="py-10">
          <h2 id="prov" className="text-xl font-semibold">Providers</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="card"><Layers className="h-5 w-5 text-indigo-700" aria-hidden /><h3 className="mt-2 font-semibold">Google Gemini</h3><p className="muted">Claims, contradictions and embeddings. Bring your own key.</p></div>
            <div className="card"><Layers className="h-5 w-5 text-indigo-700" aria-hidden /><h3 className="mt-2 font-semibold">Groq</h3><p className="muted">Fast claim analysis. No embeddings, so semantic analysis is reported unavailable.</p></div>
            <div className="card"><Layers className="h-5 w-5 text-indigo-700" aria-hidden /><h3 className="mt-2 font-semibold">Ollama (local)</h3><p className="muted">Optional. Runs on your own machine, called directly from your browser.</p></div>
          </div>
          <p className="mt-4 text-sm text-slate-600">No key? <strong>Native analysis</strong> works with no AI at all and clearly labels what it cannot do.</p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <div className="card"><ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden /><h3 className="mt-2 font-semibold">Your keys stay yours</h3><p className="muted">Keys are held in browser memory only — never stored, logged or exported.</p></div>
          <div className="card"><Sigma className="h-5 w-5 text-emerald-700" aria-hidden /><h3 className="mt-2 font-semibold">Consistency ≠ correctness</h3><p className="muted">Agreement between answers is not proof they are true. Scores measure consistency among the responses you submit.</p></div>
        </section>
      </main>
    </div>
  );
}
