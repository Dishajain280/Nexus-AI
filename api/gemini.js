// Vercel serverless function: POST /api/gemini
// Vercel's Node runtime can invoke this function with EITHER signature
// depending on runtime version/config, so this adapter speaks both dialects:
//
//  1. Web-standard: handler receives a `Request` (has .text()) → return a `Response`.
//  2. Classic Node: handler receives an http.IncomingMessage stream + a
//     ServerResponse (has .status()/.setHeader()/.end() — NOT Express's .set()).
//
// Both paths share the validation logic in nexus/api/gemini-core.js, and the
// Gemini key is only ever attached server-side.
import { handleGeminiRequest } from "../nexus/api/gemini-core.js";

// Read a Node-style request body from its stream.
function readNodeBody(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}

const HAS_BODY = (method) => method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";

export default async function handler(req, res) {
  // Web-standard dialect: req is a Request (readable via .text()).
  if (typeof req?.text === "function") {
    const core = await handleGeminiRequest({ method: req.method, body: await req.text() });
    return new Response(core.body, { status: core.statusCode, headers: core.headers });
  }

  // Classic Node dialect: req is an IncomingMessage stream.
  const body = HAS_BODY(req?.method) ? await readNodeBody(req) : "";
  const core = await handleGeminiRequest({ method: req?.method, body });

  if (res && typeof res.status === "function") {
    res.status(core.statusCode);
    for (const [key, value] of Object.entries(core.headers)) res.setHeader(key, value);
    res.end(core.body);
    return;
  }

  // Unknown dialect — still answer correctly via the web Response contract.
  return new Response(core.body, { status: core.statusCode, headers: core.headers });
}
