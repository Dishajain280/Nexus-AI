// Shared serverless core for the /api/gemini proxy.
// The Gemini API key never ships to the browser: the client calls /api/gemini
// and this module forwards requests to Google with the key attached
// server-side. Works on Vercel, Netlify, and the Vite dev server.
//
// Three modes (chosen by request body shape):
//  1. Chat:         { prompt }                          — single turn
//  2. Multi-turn:   { prompt, contents, tools? }        — conversation w/ optional
//                  function-calling tool declarations passed through verbatim
//  3. Embeddings:   { embed: { text } }                 — single vector
//                   { embeds: { inputs: [...] } }       — batch vectors (RAG)

const GEMINI_MODEL = "gemini-3-flash-preview";
const EMBED_MODEL = "gemini-embedding-001";
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const MAX_PROMPT_CHARS = 8000;
const MAX_TURNS = 24;
const MAX_EMBED_INPUTS = 32;
const MAX_EMBED_CHARS = 4000;

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

async function callGoogle(path, payload) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return json(
      { error: "GEMINI_API_KEY is not configured on the server. Set it in your hosting dashboard or .env file." },
      500,
    );
  }
  try {
    const upstream = await fetch(`${BASE}/${path}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message = data?.error?.message || `Gemini request failed (HTTP ${upstream.status})`;
      return json({ error: message }, upstream.status);
    }
    // Raw passthrough (candidates, functionCall parts, embeddings, …).
    return json(data, 200);
  } catch (err) {
    console.error("Gemini proxy error:", err);
    return json({ error: "Failed to reach the Gemini API." }, 502);
  }
}

// Build Gemini `contents`. Plain {role,text} turns are normalized
// (assistant -> model). Turns that already carry raw `parts` (functionCall /
// functionResponse) are passed through untouched so tool calls keep working.
function buildContents(rawContents, prompt) {
  const apiContents = [];
  for (const turn of rawContents.slice(-MAX_TURNS)) {
    if (Array.isArray(turn?.parts)) {
      apiContents.push({ role: turn?.role === "model" ? "model" : turn?.role || "user", parts: turn.parts });
      continue;
    }
    const text = typeof turn?.text === "string" ? turn.text.trim().slice(0, MAX_PROMPT_CHARS) : "";
    if (!text) continue;
    apiContents.push({ role: turn?.role === "model" ? "model" : "user", parts: [{ text }] });
  }
  if (apiContents.length === 0) return null;
  if (apiContents[apiContents.length - 1].role !== "user" && apiContents[apiContents.length - 1].role !== "function") {
    apiContents.push({ role: "user", parts: [{ text: prompt || "Continue." }] });
  }
  return apiContents;
}

// Normalized handler: (req-like { method, body }) => { statusCode, headers, body }.
export async function handleGeminiRequest(req) {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";

  // ---- Mode 3: embeddings ----
  const embedInputs =
    body?.embed?.text != null ? [body.embed.text]
    : Array.isArray(body?.embeds?.inputs) ? body.embeds.inputs
    : null;

  if (embedInputs) {
    const inputs = embedInputs.map((t) => String(t ?? "").slice(0, MAX_EMBED_CHARS));
    if (inputs.length === 0 || inputs.some((t) => !t.trim())) {
      return json({ error: "Embed text is required." }, 400);
    }
    if (inputs.length > MAX_EMBED_INPUTS) {
      return json({ error: `Too many embed inputs (max ${MAX_EMBED_INPUTS}).` }, 413);
    }
    if (inputs.length === 1) {
      return callGoogle(`${EMBED_MODEL}:embedContent`, {
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: inputs[0] }] },
      });
    }
    // batchEmbedContent is not available on v1beta for this model, so batch
    // requests run as sequential single calls, combined into the same shape.
    const embeddings = [];
    for (const text of inputs) {
      const single = await callGoogle(`${EMBED_MODEL}:embedContent`, {
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
      });
      if (single.statusCode !== 200) return single; // propagate first error
      try {
        embeddings.push(JSON.parse(single.body).embedding);
      } catch {
        return json({ error: "Malformed embedding response." }, 502);
      }
    }
    return json({ embeddings }, 200);
  }

  // ---- Modes 1 + 2: chat ----
  const rawContents = Array.isArray(body?.contents) ? body.contents : null;
  if (!prompt && !rawContents) {
    return json({ error: "Prompt is required." }, 400);
  }

  let apiContents;
  if (rawContents) {
    if (rawContents.length > MAX_TURNS) {
      return json({ error: `Conversation is too long (max ${MAX_TURNS} turns).` }, 413);
    }
    apiContents = buildContents(rawContents, prompt);
    if (!apiContents) return json({ error: "Prompt is required." }, 400);
  } else {
    if (prompt.length > MAX_PROMPT_CHARS) {
      return json({ error: `Prompt is too long (max ${MAX_PROMPT_CHARS} characters).` }, 413);
    }
    apiContents = [{ role: "user", parts: [{ text: prompt }] }];
  }

  const payload = { contents: apiContents };

  // Function-calling tool declarations pass through verbatim (first-party client).
  if (Array.isArray(body?.tools) && body.tools.length > 0) {
    payload.tools = body.tools;
  }

  return callGoogle(`${GEMINI_MODEL}:generateContent`, payload);
}
