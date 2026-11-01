# Architecture

## Layout
```
engine/            Pure TypeScript, no DOM/Node APIs → runs in browser, Vercel Function and tests
  types.ts           shared types + limits + default weights
  text.ts            normalisation, tokenisation, sentences
  similarity.ts      TF-IDF, cosine, matrices
  structure.ts       structural profiles, requested elements, structural score
  scoring.ts         metric helpers + weighted overall (missing-data handling)
  outliers.ts        robust outlier detection with reasons
  pairs.ts           claim relations → per-pair verdicts
  native.ts          rule-based candidate disagreements (no LLM)
  validation.ts      request / provider-config validation
  pipeline.ts        runAnalysis(): orchestrates all modules, tolerates partial failure
  compare.ts         provider comparison
  report.ts          printable HTML report
  summary.ts         deterministic summary text
  demo.ts            sample inputs only
  llm/               prompts + strict schema validators: claims, relations, explanation, JSON retry
  providers/         AIProvider interface + Gemini / Groq / Ollama adapters + factory
api/               Vercel Functions: analyze.ts, test-connection.ts (+ _lib handlers, wrapper)
src/               React app (pages, components, in-memory state)
tests/             Vitest suites
```

## Data flow
- **Native**: browser → `runAnalysis(mode:"native")` locally. No network.
- **Gemini/Groq**: browser → `POST /api/analyze {request, provider}` → `createProvider` → `runAnalysis` → provider API. Key travels in the body over HTTPS, then in a provider header; never logged, redacted from errors, absent from the response.
- **Ollama**: browser → `runAnalysis` with `OllamaProvider` → `http://localhost:11434`. The server is never involved (it cannot reach the user's localhost).

## Provider abstraction
`AIProvider { generate, embed, listModels, supportsEmbeddings }`. Each adapter owns auth, request shape, parsing, timeout (shared `requestJson`), HTTP→typed error mapping (`auth`, `rate_limit`, `timeout`, `network`, `model_not_found`, `bad_response`, `bad_request`, `unavailable`) and secret redaction. Adding a provider = one adapter + one `case` in `createProvider`. The pipeline only sees the interface.

## Hybrid pipeline
1. Deterministic: textual similarity, structure (always run).
2. LLM-assisted (parallel): embeddings → semantic matrix; claim extraction per response (concurrency 3, JSON-validated, one corrective retry) → grounding check → cross-response relation labelling (one call per anchor response vs later responses).
3. Derived: pair verdicts, outliers, scores, explanation (LLM with deterministic fallback).

Failure policy: each stage reports `ok | unavailable | failed | skipped` with a reason. Failed stages leave their metric `null` (excluded, overall = partial). Invalid credentials abort with an auth error rather than returning an empty report.

## Deterministic vs LLM-generated
Every UI card/badge states which it is. Deterministic: textual, structure, outliers' distance maths, scoring, rule-based flags. LLM: claims, relations, relation explanations, narrative explanation, (embeddings are model-derived).

## Security decisions
Keys: memory only (React state), header-only to providers, redacted in errors, never in storage/logs/reports. Server validates and bounds all input (sizes, counts, body limit, rate limit), uses fixed provider hosts (no user-supplied URLs → no SSRF; Ollama URL is only ever used in the browser). `Cache-Control: no-store` on API.

## Why no database
Core evaluation is stateless. History is optional, result-only, in `localStorage`.
