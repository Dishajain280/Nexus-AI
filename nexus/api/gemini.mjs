// Netlify Functions v2 adapter: /.netlify/functions/gemini
// netlify.toml redirects /api/gemini -> here.
// The .mjs extension matters: a .js file in a "type": "module" package
// still compiles to gemini.js (not gemini) on Netlify's function bundler.
import { handleGeminiRequest } from "./gemini-core.js";

export default async (req) => {
  const { statusCode, headers, body } = await handleGeminiRequest(req);
  return new Response(body, { status: statusCode, headers });
};
