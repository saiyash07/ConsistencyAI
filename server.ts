/**
 * Production server for hosts that run a long-lived Node process (e.g. Render).
 * Serves the built SPA from dist/ and the same API handlers used by the Vercel functions.
 * Not used on Vercel (it uses api/*.ts directly).
 */
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { handleAnalyze, handleTestConnection, rateLimited } from "./api/_lib/handlers";

const DIST = resolve(process.cwd(), "dist");
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = Number(process.env.MAX_BODY_BYTES) || 200_000;
const RATE = Number(process.env.RATE_LIMIT_PER_MINUTE) || 20;
const TIMEOUT = Number(process.env.PROVIDER_TIMEOUT_MS) || 25000;

const routes = {
  "/api/analyze": (b: unknown) => handleAnalyze(b, { timeoutMs: TIMEOUT }),
  "/api/test-connection": (b: unknown) => handleTestConnection(b, { timeoutMs: TIMEOUT }),
} as const;

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".json": "application/json", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

function send(res: ServerResponse, status: number, body: string | Buffer, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "X-Content-Type-Options": "nosniff", ...(type === "application/json" ? { "Cache-Control": "no-store" } : {}) });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { fail(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });
}

createServer(async (req, res) => {
  const path = (req.url ?? "/").split("?")[0];
  const handler = routes[path as keyof typeof routes];
  if (handler) {
    if (req.method !== "POST") return send(res, 405, JSON.stringify({ error: { code: "method_not_allowed", message: "Use POST." } }));
    const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "unknown").split(",")[0].trim();
    if (rateLimited(ip, RATE)) return send(res, 429, JSON.stringify({ error: { code: "rate_limit", message: "Too many requests. Please wait a minute." } }));
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      const reply = await handler(body);
      return send(res, reply.status, JSON.stringify(reply.body));
    } catch (e) {
      const tooLarge = (e as Error).message === "too large";
      return send(res, tooLarge ? 413 : 400, JSON.stringify({ error: { code: tooLarge ? "too_large" : "bad_json", message: tooLarge ? "Request body is too large." : "Body must be valid JSON." } }));
    }
  }
  if (path.startsWith("/api/")) return send(res, 404, JSON.stringify({ error: { code: "not_found", message: "Unknown endpoint." } }));

  // Static files with SPA fallback; reject path traversal.
  const file = normalize(join(DIST, path));
  const target = file.startsWith(DIST) && existsSync(file) && statSync(file).isFile() ? file : join(DIST, "index.html");
  if (!existsSync(target)) return send(res, 500, "Build output missing. Run npm run build.", "text/plain");
  const cache = target.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
  res.writeHead(200, { "Content-Type": TYPES[extname(target)] ?? "application/octet-stream", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" });
  res.end(readFileSync(target));
}).listen(PORT, () => console.log(`Consistency AI listening on :${PORT}`));
