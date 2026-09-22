import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

// Dev-server middleware so /api/gemini works during development exactly like
// it does in production: the request goes through nexus/api/gemini-core.js,
// which reads GEMINI_API_KEY from the server environment (.env).
// The key is never exposed to the browser bundle.
function geminiDevProxy() {
  return {
    name: "gemini-dev-proxy",
    configureServer(server) {
      server.middlewares.use("/api/gemini", async (req, res) => {
        const { handleGeminiRequest } = await import("./api/gemini-core.js");
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString("utf8");
        const result = await handleGeminiRequest({
          method: req.method,
          body: raw,
        });
        res.statusCode = result.statusCode;
        for (const [key, value] of Object.entries(result.headers)) {
          res.setHeader(key, value);
        }
        res.end(result.body);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load .env from the directory containing this config (works no matter
  // which cwd npm was invoked from).
  const env = loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "");
  // Expose the key to the server-side dev middleware only (Node process.env).
  // This is NOT a Vite `define` — it never reaches client code.
  if (!process.env.GEMINI_API_KEY && env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  }
  return {
    plugins: [react(), geminiDevProxy()],
  };
});
