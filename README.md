# Consistency AI — AI Response Consistency Analyzer

Compare 2–10 AI-generated answers to the same question and see where they agree, contradict, differ in structure, or stand out — with an explanation for every number.

*Project category: AI Tools & Prompt Engineering · Mini project.*

## Problem statement
AI systems give different answers to the same prompt: different facts, contradictions, missing information, different structure. Finding those differences by hand is slow. Consistency AI evaluates them systematically and presents the result in an explainable report.

## Objectives
1. Accept a question and 2–10 responses; validate input.
2. Measure textual and semantic similarity between every response pair.
3. Extract factual claims and detect agreement/contradiction between responses.
4. Compare structure against what the question asked for.
5. Identify and explain outlier responses.
6. Produce a documented, configurable consistency score — without treating consistency as correctness.
7. Work without any AI provider (native mode); support Gemini, Groq and local Ollama (BYOK).
8. Export reports; compare two evaluators side by side.

## Features
| Area | What is implemented |
|---|---|
| Input | Question + 2–10 labelled, editable responses; empty/duplicate/oversize/structure validation |
| Textual similarity | Normalisation, tokenisation, sentence segmentation, TF-IDF, pairwise cosine matrix (labelled *lexical*) |
| Semantic similarity | Embedding cosine matrix (Gemini `gemini-embedding-001`, Ollama `/api/embed`). **Unavailable** (never substituted) for Groq or Ollama without an embedding model |
| Claims | LLM extraction → id, original (verbatim) + normalised text, subject/predicate/object, qualifiers, certainty. Claims not found in the response are flagged and excluded |
| Contradictions | LLM classifies cross-response claim pairs: agreement, contradiction, partial agreement, additional info, insufficient info, uncertain |
| Structure | words, sentences, paragraphs, headings, bullets, numbered lists, estimated points; requested-count (“three advantages”) and sentence-range checks |
| Outliers | Robust (median/MAD) tests on semantic/textual distance, claim-disagreement rate, structural deviations, each with stated reasons |
| Scoring | 4 metrics + weighted overall; unavailable metrics excluded (not zero) and flagged *partial* |
| Native mode | No AI: TF-IDF, structure, outliers, rule-based candidate disagreements (differing entities, numbers, negation) |
| Provider comparison | Same responses through two evaluators; per-pair verdict agreement, claim matching, score deltas, explanations side by side |
| Reports | Self-contained HTML download + print-to-PDF; history in browser `localStorage` (results only) |
| Demo playground | The three required scenarios as *inputs only*; results come from the real engine |

## Technology stack
React 19 · TypeScript · Vite · Tailwind CSS 4 · Recharts · Lucide · React Router · Vercel Functions (TypeScript) · Vitest + Testing Library.

## Architecture (short)
```
Browser (React) ──native / Ollama──────────► engine/ (pure TS, runs in browser)
        │
        └─ Gemini / Groq ─ HTTPS ─► /api/analyze (Vercel Function) ─► engine/ ─► provider API
```
The evaluation engine (`engine/`) is isomorphic and provider-independent. Details: [ARCHITECTURE.md](ARCHITECTURE.md). Endpoints: [API_DOCUMENTATION.md](API_DOCUMENTATION.md).

## Evaluation methodology
**Textual similarity** — lowercase/strip accents/markup, remove stopwords, TF-IDF (`tf = count/len`, `idf = ln((1+N)/(1+df)) + 1`), cosine. Score = mean over unique pairs.

**Semantic agreement** — cosine between embedding vectors; negatives clamped to 0; *not* rescaled (embedding cosines of unrelated texts are often 0.4–0.6, so read this as relative, not absolute). Score = mean over unique pairs.

**Claim agreement** — per response pair: `(agreements + 0.5·partial) / (agreements + partial + contradictions)`; additional/insufficient/uncertain relations are excluded; pairs with no decisive relation are skipped; score = mean over remaining pairs. Unavailable if no pair has decisive relations.

**Structural consistency** — per pair: `0.5·min(words)/max(words) + 0.5·(share of matching flags: heading, bullets, numbered list, multi-paragraph)`, averaged. If the question requests *N* items: `0.7·that + 0.3·(1 − (max coverage − min coverage))`, coverage = `min(1, estimatedPoints/N)`.

**Overall** — `Σ wₖ·mₖ / Σ wₖ` over *available* metrics. Default weights: textual 0.20, semantic 0.30, claim 0.35, structural 0.15 (claims and meaning matter most; wording least). Weights are configurable in Settings. If any metric is missing the overall is marked **partial** and says which; if none, it is unavailable.

**Limitations of the score**: it measures consistency *among the submitted responses*, not truth. Majority agreement is never treated as proof. Weights are a judgement call, not empirically tuned. Point-count and rule-based checks are heuristics. LLM claim/relation labels can be wrong and vary between providers and runs.

## Provider configuration (BYOK)
Open **Settings**, paste a key, click **Test connection**, pick a model.
- **Gemini** — key from <https://aistudio.google.com/apikey>. Supports embeddings.
- **Groq** — key from <https://console.groq.com/keys>. No embeddings API → semantic analysis reported unavailable.

Keys are kept in browser memory only: not in localStorage/sessionStorage, not in any database, not logged, not in reports; sent over HTTPS to this app's backend only to call your provider (as a header, never in a URL); cleared on **Disconnect**, refresh or closing the tab. Your question and responses are transmitted to the selected provider. No analytics are included. There are no shared developer keys.

## Local LLM (Ollama, optional)
A Vercel backend cannot reach your `localhost`, so the **browser** calls Ollama directly.
1. `ollama pull llama3.2` and `ollama pull nomic-embed-text` (embedding model optional).
2. Allow the site origin (CORS): `OLLAMA_ORIGINS="https://<your-app>.vercel.app" ollama serve` (for `npm run dev` use `http://localhost:5173`). macOS app: `launchctl setenv OLLAMA_ORIGINS "<origin>"`, then restart Ollama.
3. Use Chrome/Edge/Firefox (Chrome may prompt for local-network access; Safari blocks http://localhost from https pages).
4. Settings → Ollama → Test connection → choose chat/embedding model.

If it can't connect you get an explanation and can switch to another provider; Ollama is never required.

## Installation & running
Requires Node 20+.
```bash
npm install
npm run dev        # http://localhost:5173 — also serves /api/* locally (no Vercel CLI needed)
npm test           # all automated tests
npm run build      # typecheck + production build into dist/
npm run preview    # serve the production build (static only; /api needs `vercel dev` or deployment)
```

## Deployment (Vercel)
1. Push this folder to GitHub.
2. Vercel → *Add New Project* → import the repo. Framework preset: **Vite** (auto). `vercel.json` already sets build command, output dir, SPA rewrite, 60 s function duration.
3. No environment variables are required. (Optional tuning in `.env.example`.)
4. Deploy, then open the URL on a second device and test Native analysis, then a provider.

CLI alternative: `npx vercel` (preview) → `npx vercel --prod`.

**Status:** this repository has been built, type-checked and tested locally, and the serverless functions were bundled and exercised locally. It has **not** been deployed to Vercel from this environment (that needs your Vercel account), so the public URL and the second-device test remain for you to run.

## Testing
See [TESTING.md](TESTING.md). `npm test` runs 91 tests.

## Troubleshooting
| Symptom | Fix |
|---|---|
| “Authentication failed” | Wrong/expired key; re-create it. The message never contains the key |
| “Rate limit reached” | Free-tier quota; wait or switch provider/model |
| Semantic analysis “unavailable” | Provider has no embeddings (Groq) or no Ollama embedding model chosen |
| Ollama “Could not reach” | Ollama not running, `OLLAMA_ORIGINS` missing, or Safari |
| Function timeout (504) on large inputs | Fewer/shorter responses; Vercel Hobby limits apply |
| `/api` 404 with `npm run preview` | Preview is static; use `npm run dev` or `vercel dev` |

## Known limitations
- Claim extraction and relation labelling depend on the LLM; results can differ between providers and runs (that is what Provider Comparison shows).
- Native mode cannot assess meaning or facts; its rule-based flags are candidates only and can miss or over-flag.
- Embedding scores are not calibrated across models.
- Rate limiting is per serverless instance (best effort).
- Requested-item counting and “estimated points” are heuristics, tuned for English.
- Default model names (`gemini-2.5-flash`, `llama-3.3-70b-versatile`) may be retired by the providers; after connecting, pick from the live model list.
- Live calls with valid Gemini/Groq/Ollama credentials have not been exercised by the automated tests (see TESTING.md).
