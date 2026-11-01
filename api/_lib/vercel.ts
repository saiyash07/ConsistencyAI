import type { VercelRequest, VercelResponse } from "@vercel/node";
import { rateLimited, toErrorReply } from "./handlers";
import type { ApiReply } from "./handlers";

const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES) || 200_000;
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE) || 20;

/** Shared wrapper: method check, size limit, rate limit, JSON parsing, safe errors. */
export function wrap(fn: (body: unknown) => Promise<ApiReply>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: { code: "method_not_allowed", message: "Use POST." } });
    }
    const ip = String(req.headers["x-forwarded-for"] ?? req.socket?.remoteAddress ?? "unknown").split(",")[0].trim();
    if (rateLimited(ip, RATE_LIMIT)) return res.status(429).json({ error: { code: "rate_limit", message: "Too many requests. Please wait a minute." } });
    const len = Number(req.headers["content-length"] ?? 0);
    if (len > MAX_BODY_BYTES) return res.status(413).json({ error: { code: "too_large", message: "Request body is too large." } });
    let body: unknown = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: { code: "bad_json", message: "Body must be valid JSON." } });
      }
    }
    try {
      const reply = await fn(body);
      return res.status(reply.status).json(reply.body);
    } catch (e) {
      const reply = toErrorReply(e);
      return res.status(reply.status).json(reply.body);
    }
  };
}
