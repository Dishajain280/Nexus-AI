import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  handleGeminiRequest,
  getApiKey,
} from "../api/gemini-core.js";

// Vitest doesn't load .env — stub a key so tests exercise the proxy logic,
// not the missing-key guard (that path gets its own dedicated test).
const ORIGINAL_KEY = process.env.GEMINI_API_KEY;
beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
});
afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_KEY;
});

const okFetch = (body) => async () => ({
  ok: true,
  status: 200,
  json: async () => body,
});

function mockFetch(impl) {
  globalThis.fetch = impl;
}

describe("handleGeminiRequest — validation", () => {
  it("rejects non-POST methods", async () => {
    const res = await handleGeminiRequest({ method: "GET" });
    expect(res.statusCode).toBe(405);
    expect(JSON.parse(res.body).error).toMatch(/POST/);
  });

  it("rejects malformed JSON bodies", async () => {
    const res = await handleGeminiRequest({ method: "POST", body: "{nope" });
    expect(res.statusCode).toBe(400);
  });

  it("requires a prompt or contents", async () => {
    const res = await handleGeminiRequest({ method: "POST", body: {} });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/Prompt is required/);
  });

  it("enforces the prompt length cap", async () => {
    const res = await handleGeminiRequest({ method: "POST", body: { prompt: "x".repeat(9000) } });
    expect(res.statusCode).toBe(413);
  });

  it("enforces the conversation turn cap", async () => {
    const turns = Array.from({ length: 30 }, (_, i) => ({ role: "user", text: `t${i}` }));
    const res = await handleGeminiRequest({ method: "POST", body: { prompt: "hi", contents: turns } });
    expect(res.statusCode).toBe(413);
  });
});

describe("handleGeminiRequest — chat passthrough", () => {
  it("forwards tools and normalizes roles for the upstream call", async () => {
    let captured;
    mockFetch(async (url, init) => {
      captured = { url, payload: JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }) };
    });

    const res = await handleGeminiRequest({
      method: "POST",
      body: {
        prompt: "save it",
        // Roles as the client sends them (App.jsx already maps assistant→model).
        contents: [
          { role: "user", text: "hello" },
          { role: "model", text: "hi there" },
        ],
        tools: [{ functionDeclarations: [{ name: "save_snippet" }] }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(captured.url).toContain("/models/gemini-3-flash-preview:generateContent");
    expect(captured.payload.tools).toEqual([{ functionDeclarations: [{ name: "save_snippet" }] }]);
    expect(captured.payload.contents.map((c) => c.role)).toEqual(["user", "model", "user"]);
    const body = JSON.parse(res.body);
    expect(body.candidates[0].content.parts[0].text).toBe("ok");
  });

  it("passes raw functionCall/functionResponse parts through untouched", async () => {
    let captured;
    mockFetch(async (url, init) => {
      captured = { url, payload: JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => ({ candidates: [] }) };
    });
    await handleGeminiRequest({
      method: "POST",
      body: {
        contents: [
          { role: "user", parts: [{ text: "go" }] },
          { role: "model", parts: [{ functionCall: { name: "save_snippet", args: { name: "x", code: "y" } } }] },
          { role: "user", parts: [{ functionResponse: { name: "save_snippet", response: { ok: true } } }] },
        ],
      },
    });
    expect(captured.payload.contents[1].parts[0].functionCall.name).toBe("save_snippet");
    expect(captured.payload.contents[2].parts[0].functionResponse.response.ok).toBe(true);
  });
});

describe("handleGeminiRequest — embeddings mode", () => {
  it("routes embed.text to embedContent and returns the vector", async () => {
    let capturedUrl;
    mockFetch(async (url) => {
      capturedUrl = url;
      return { ok: true, status: 200, json: async () => ({ embedding: { values: [0.1, 0.2] } }) };
    });
    const res = await handleGeminiRequest({ method: "POST", body: { embed: { text: "hello world" } } });
    expect(res.statusCode).toBe(200);
    expect(capturedUrl).toContain("/models/gemini-embedding-001:embedContent");
    expect(JSON.parse(res.body).embedding.values).toEqual([0.1, 0.2]);
  });

  it("combines batch embeds from sequential single calls", async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ embedding: { values: [1] } }) }));
    const res = await handleGeminiRequest({
      method: "POST",
      body: { embeds: { inputs: ["a", "b", "c"] } },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).embeddings).toHaveLength(3);
  });

  it("validates embed inputs", async () => {
    const empty = await handleGeminiRequest({ method: "POST", body: { embed: { text: "  " } } });
    expect(empty.statusCode).toBe(400);
    const tooMany = await handleGeminiRequest({
      method: "POST",
      body: { embeds: { inputs: Array.from({ length: 40 }, (_, i) => `t${i}`) } },
    });
    expect(tooMany.statusCode).toBe(413);
  });
});

describe("handleGeminiRequest — server config", () => {
  it("explains a missing API key instead of crashing", async () => {
    const original = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const res = await handleGeminiRequest({ method: "POST", body: { prompt: "hi" } });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).error).toMatch(/GEMINI_API_KEY/);
      expect(getApiKey()).toBe("");
    } finally {
      if (original !== undefined) process.env.GEMINI_API_KEY = original;
    }
  });

  it("propagates upstream errors with their status", async () => {
    mockFetch(async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "Quota exceeded. Please retry in 30s." } }),
    }));
    const res = await handleGeminiRequest({ method: "POST", body: { prompt: "hi" } });
    expect(res.statusCode).toBe(429);
    expect(JSON.parse(res.body).error).toMatch(/Quota exceeded/);
  });
});
