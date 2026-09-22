// Vercel serverless function: POST /api/gemini
// Vercel only auto-detects functions from a ROOT-level api/ directory,
// so this adapter lives here and reuses the shared core in nexus/api/.
// The Gemini API key never reaches the browser bundle.
import { handleGeminiRequest } from "../nexus/api/gemini-core.js";

export default async function handler(req, res) {
  const { statusCode, headers, body } = await handleGeminiRequest(req);
  res.status(statusCode).set(headers).end(body);
}
