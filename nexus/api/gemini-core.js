// Shared serverless core for the /api/gemini proxy.
// The Gemini API key never ships to the browser: the client calls /api/gemini
// and this module forwards the prompt to Google with the key attached
// server-side. Works on Vercel, Netlify, and the Vite dev server.

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

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

// Normalized handler: (req-like { method, body }) => { statusCode, body }.
// Both the Vercel and Netlify adapters pass this shape through.
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

  let prompt;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  if (!prompt) {
    return json({ error: "Prompt is required." }, 400);
  }
  if (prompt.length > 8000) {
    return json({ error: "Prompt is too long (max 8000 characters)." }, 413);
  }

  try {
    const upstream = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
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
