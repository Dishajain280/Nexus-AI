// Vercel serverless function: POST /api/gemini
// Uses Vercel's WEB-STANDARD signature: a handler with a single Request
// parameter that returns a Response. (Vercel's Node helper for the classic
// (req, res) signature has .status()/.setHeader() but NO Express-style .set()
// — which crashed with "res.status(...).set is not a function".)
// Vercel and Netlify both support this exact signature.
import { handleGeminiRequest } from "../nexus/api/gemini-core.js";

export default async function handler(req) {
  const { statusCode, headers, body } = await handleGeminiRequest({
    method: req.method,
    body: await req.text(),
  });
  return new Response(body, { status: statusCode, headers });
}
