// Dual-format adapter for the /api/gemini proxy — works on BOTH platforms:
//
//  • Netlify Functions v2: netlify.toml redirects /api/gemini to
//    /.netlify/functions/gemini (the .mjs extension matters — see netlify.toml).
//  • Vercel: nexus/vercel.json rewrites /api/gemini to this file when the
//    Vercel project's root directory is set to nexus/.
//
// The Vercel root-directory deployment path also has a dedicated adapter at
// <repo-root>/api/gemini.js for the default root-directory setup.
import { handleGeminiRequest } from "./gemini-core.js";

export default async (req) => {
  const { statusCode, headers, body } = await handleGeminiRequest(req);
  return new Response(body, { status: statusCode, headers });
};
