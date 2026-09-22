// Shared serverless core for the /api/gemini proxy.
// The Gemini API key never ships to the browser: the client calls /api/gemini
// and this module forwards the request to Google with the key attached
// server-side. Works on Vercel, Netlify, and the Vite dev server.
// Supports both single-turn prompts and multi-turn conversations (`contents`).

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

const MAX_PROMPT_CHARS = 8000;
const MAX_TURNS = 24;

export function getApiKey() {
  // Vercel/Netlify/dotenv all use GEMINI_API_KEY.
  return process.env.GEMINI_API_KEY || "";
}

function json(body, status = 200) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// Normalized handler: (req-like { method, body }) => { statusCode, headers, body }.
export async function handleGeminiRequest(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return json(
      {
        error:
          "GEMINI_API_KEY is not configured on the server. Set it in your hosting dashboard or .env file.",
      },
      500,
    );
  }

  let prompt = "";
  let rawContents = null;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    rawContents = Array.isArray(body?.contents) ? body.contents : null;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  if (!prompt && !rawContents) {
    return json({ error: "Prompt is required." }, 400);
  }

  // Build the Gemini `contents` payload. Two modes:
  //  • Multi-turn: the client sends `contents` (recent chat history including
  //    the new user turn). Turns are capped and roles normalized
  //    (assistant -> model, which is what Gemini expects).
  //  • Single-turn: `prompt` only — the original compatible path.
  let apiContents;
  if (rawContents) {
    if (rawContents.length > MAX_TURNS) {
      return json({ error: `Conversation is too long (max ${MAX_TURNS} turns).` }, 413);
    }
    apiContents = [];
    for (const turn of rawContents.slice(-MAX_TURNS)) {
      const text = typeof turn?.text === "string" ? turn.text.trim().slice(0, MAX_PROMPT_CHARS) : "";
      if (!text) continue;
      apiContents.push({ role: turn?.role === "model" ? "model" : "user", parts: [{ text }] });
    }
    if (apiContents.length === 0) {
      return json({ error: "Prompt is required." }, 400);
    }
    // Gemini requires the conversation to end on a user turn.
    if (apiContents[apiContents.length - 1].role !== "user") {
      apiContents.push({ role: "user", parts: [{ text: prompt || "Continue." }] });
    }
  } else {
    if (prompt.length > MAX_PROMPT_CHARS) {
      return json({ error: `Prompt is too long (max ${MAX_PROMPT_CHARS} characters).` }, 413);
    }
    apiContents = [{ role: "user", parts: [{ text: prompt }] }];
  }

  try {
    const upstream = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: apiContents }),
    });

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const message =
        data?.error?.message || `Gemini request failed (HTTP ${upstream.status})`;
      return json({ error: message }, upstream.status);
    }

    // Pass the Gemini payload through (candidates, finishReason, etc.).
    return json(data, 200);
  } catch (err) {
    console.error("Gemini proxy error:", err);
    return json({ error: "Failed to reach the Gemini API." }, 502);
  }
}
