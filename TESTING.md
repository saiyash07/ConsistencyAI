# Testing

`npm test` → 7 files, 91 tests, all passing at the time of writing. `npm run build` also typechecks.

| Suite | Covers |
|---|---|
| `tests/engine.test.ts` | normalisation, tokenisation, sentences, TF-IDF/cosine, structure + requested elements, scoring formulas & missing-data handling, pair summaries, outliers, rule-based flags, request/provider validation |
| `tests/providers.test.ts` | Gemini/Groq/Ollama adapters against a mocked `fetch`: auth header placement (key never in URL), JSON mode, status→error mapping, key redaction, timeouts, blocked/empty output, embeddings, model listing, Ollama URL validation and connectivity messages |
| `tests/llm.test.ts` | JSON extraction + corrective retry, claim schema validator, grounding check, relation validator (drops hallucinated ids), concurrency helper |
| `tests/pipeline.test.ts` | **Regression on the 3 demo scenarios** (native: deterministic structural/lexical expectations; hybrid: plumbing with a deterministic fake LLM), Groq-style no-embeddings, partial failures, auth abort, invented-claim exclusion |
| `tests/api.test.ts` | handlers: validation 400s, native without key, 401 on bad key with no key leakage, full mocked-Gemini hybrid run, timeouts, test-connection, rate limiter |
| `tests/compare-report.test.ts` | evaluator comparison (disagreement not reconciled), report sections, HTML escaping, no credentials |
| `tests/frontend.test.tsx` | add/remove responses (2–10), validation messages, native run → results, demo scenarios, masked key / connect / disconnect / nothing persisted, invalid-key error, Ollama failure message, empty dashboard/reports, report download |

## What the tests do and do not prove
- The fake LLM in `tests/helpers.ts` is a **deterministic stand-in**. It proves schema handling, orchestration, scoring and degradation — **not** the quality of real model judgments.
- No automated test calls a live Gemini/Groq/Ollama service with a valid credential. A manual check against the real Groq endpoint with an invalid key returned the provider's genuine 401, mapped to `auth`.
- LLM-based expectations (e.g. Canberra vs Sydney) must be inspected manually per provider; wording and confidence are not asserted.

## Manual checks performed
- Production build succeeds; no key-like strings in `dist/`.
- `api/analyze.ts` and `api/test-connection.ts` bundle (esbuild, Node CJS) and the bundled handler returned 405/200/400/400 for GET / valid native / bad JSON / invalid input.
- Headless Chrome: demo scenario 1 run in native mode renders results with no console errors; no horizontal overflow at 390 px on any page.

## Not yet done (requires you)
- Vercel deployment and second-device test.
- Live-provider runs of the three scenarios with your own keys; Ollama run on your machine.

## Manual checklist for live providers
1. Settings → connect → Demo → *Factual contradiction* → expect A/C agreement and B/D contradictions flagged (and that the report says nothing about which is correct).
2. *Semantic consistency* with Gemini → semantic matrix present, D separated; with Groq → semantic “Unavailable”.
3. *Structural* → C flagged for fewer than 3 advantages, B shown as numbered list.
4. Provider comparison Gemini vs Groq → disagreements (if any) shown side by side.
