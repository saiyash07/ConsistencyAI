# API

Both endpoints: `POST`, JSON, `Cache-Control: no-store`. Other methods → 405. Body limit 200 KB (413). Per-IP limit 20/min (429, best effort).

## POST /api/analyze
```json
{
  "request": {
    "question": "string (≤2000 chars)",
    "responses": [{ "id": "unique ≤64", "label": "≤40", "text": "≤8000 chars" }],
    "mode": "native | hybrid",
    "weights": { "textual": 0.2, "semantic": 0.3, "claim": 0.35, "structural": 0.15 }
  },
  "provider": { "provider": "gemini | groq", "apiKey": "string", "model": "string" }
}
```
`provider` is required only for `hybrid`. 2–10 responses, ≤60 000 chars total, no duplicate texts. `ollama` is rejected (400): it runs in the browser.

**200** `{ "result": AnalysisResult }` (see `engine/types.ts`): scores (with `status`, `method`, `reason` per metric and `overall.completeness`), similarity matrices (`semanticSimilarity` is `null` when unavailable), `claims`, `relations`, `pairSummaries`, `structure`, `outliers`, `stages`, `explanation`, `limitations`, `warnings`. The result never contains the API key.

**Errors** `{ "error": { "code", "message", "issues?" } }`

| HTTP | code | meaning |
|---|---|---|
| 400 | validation / bad_json / bad_request | invalid input (`issues` lists each problem) |
| 401 | auth | provider rejected the key |
| 404 | model_not_found | model unavailable |
| 413 | too_large | body too big |
| 429 | rate_limit | our limiter or the provider's |
| 502 | network / unavailable / bad_response | provider unreachable or malformed output |
| 504 | timeout | provider call exceeded timeout (25 s default) |

Partial LLM failures do **not** error: the result is 200 with `stages.*.status` and `warnings` describing what failed.

## POST /api/test-connection
Body: `{ "provider": { "provider": "gemini|groq", "apiKey": "...", "model": "..." } }`
**200** `{ "ok": true, "models": ["..."], "supportsEmbeddings": true }`; errors as above.

## Ollama (browser only)
Not an API of this app. The browser calls `GET {base}/api/tags`, `POST {base}/api/chat`, `POST {base}/api/embed` directly.
