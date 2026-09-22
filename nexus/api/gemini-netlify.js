// Netlify Functions v2 adapter: /.netlify/functions/gemini
// Add a redirect from /api/gemini to this function in netlify.toml.
import { handleGeminiRequest } from "./gemini-core.js";

export default async (req) => {
  const { statusCode, headers, body } = await handleGeminiRequest(req);
  return new Response(body, { status: statusCode, headers });
};
