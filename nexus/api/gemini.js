// Vercel serverless function: /api/gemini -> nexus/api/gemini-core.js
import { handleGeminiRequest } from "./gemini-core.js";

export default async function handler(req, res) {
  const { statusCode, headers, body } = await handleGeminiRequest(req);
  res.status(statusCode).set(headers).end(body);
}
