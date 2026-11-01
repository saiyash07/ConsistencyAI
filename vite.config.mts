/// <reference types="vitest/config" />
import type { IncomingMessage } from "node:http";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { handleAnalyze, handleTestConnection } from "./api/_lib/handlers";

/**
 * Dev-only: serves /api/* from the same handler code used by the Vercel functions,
 * so `npm run dev` works without the Vercel CLI. Not part of the production build.
 */
function devApi(): Plugin {
  const routes: Record<string, typeof handleAnalyze> = {
    "/api/analyze": handleAnalyze,
    "/api/test-connection": handleTestConnection,
  };
  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      let data = "";
      req.on("data", (c) => { data += c; if (data.length > 200_000) reject(new Error("too large")); });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
  return {
    name: "consistency-ai-dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const handler = routes[(req.url ?? "").split("?")[0]];
        if (!handler) return next();
        res.setHeader("Content-Type", "application/json");
        if (req.method !== "POST") { res.statusCode = 405; return res.end(JSON.stringify({ error: { code: "method_not_allowed", message: "Use POST." } })); }
        try {
          const reply = await handler(JSON.parse((await readBody(req)) || "{}"));
          res.statusCode = reply.status;
          res.end(JSON.stringify(reply.body));
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: { code: "bad_request", message: "Invalid request body." } }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
  build: { outDir: "dist", sourcemap: false },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
  },
});
