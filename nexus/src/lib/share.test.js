import { describe, it, expect } from "vitest";
import { encodeSnippetToHash, decodeSnippetFromHash } from "./share.js";

describe("share link round trip", () => {
  it("encodes and decodes a snippet losslessly", () => {
    const snippet = { name: "Debounce", code: "const d=(f,w)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),w)}};", tags: ["js", "utils"] };
    const hash = encodeSnippetToHash(snippet);
    expect(hash.startsWith("#/s/")).toBe(true);
    // URL-safe base64: no +, /, or =
    expect(hash).toMatch(/^#\/s\/[A-Za-z0-9_-]+$/);
    expect(decodeSnippetFromHash(hash)).toEqual(snippet);
  });

  it("survives unicode content", () => {
    const snippet = { name: "Résumé ✓", code: "// héllo — 日本語", tags: ["tag-with-ümlaut"] };
    expect(decodeSnippetFromHash(encodeSnippetToHash(snippet))).toEqual(snippet);
  });

  it("truncates oversized names/codes and caps tags", () => {
    const hash = encodeSnippetToHash({
      name: "x".repeat(500),
      code: "y".repeat(30000),
      tags: Array.from({ length: 20 }, (_, i) => `t${i}`),
    });
    const out = decodeSnippetFromHash(hash);
    expect(out.name).toHaveLength(80);
    expect(out.code).toHaveLength(20000);
    expect(out.tags).toHaveLength(8);
  });

  it("normalizes garbage input into a usable snippet", () => {
    const out = decodeSnippetFromHash(encodeSnippetToHash({ code: 42, tags: "not-an-array" }));
    expect(out.name).toBe("Untitled snippet");
    expect(out.code).toBe("42");
    expect(out.tags).toEqual([]);
  });
});

describe("decodeSnippetFromHash rejects bad input", () => {
  it("returns null for malformed hashes", () => {
    expect(decodeSnippetFromHash("")).toBeNull();
    expect(decodeSnippetFromHash(null)).toBeNull();
    expect(decodeSnippetFromHash("#/s/")).toBeNull();
    expect(decodeSnippetFromHash("#/s/not-base64!!!")).toBeNull();
    expect(decodeSnippetFromHash("#/other/path")).toBeNull();
  });

  it("returns null for valid base64 that is not JSON", () => {
    // "###" is valid base64url alphabet but not JSON
    expect(decodeSnippetFromHash("#/s/IyM")).toBeNull();
  });
});
