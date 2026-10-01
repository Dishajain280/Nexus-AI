import { describe, it, expect } from "vitest";
import {
  fuzzySubsequence,
  fuzzyScore,
  scoreKeyword,
  blendScores,
  findHighlightRanges,
  sortSnippets,
} from "./snippet-search.js";

describe("fuzzySubsequence", () => {
  it("matches typos as in-order subsequences", () => {
    expect(fuzzySubsequence("debonce", "debounce function")).toBe(true);
    expect(fuzzySubsequence("flaten", "Flatten nested array")).toBe(true);
    expect(fuzzySubsequence("xyz", "debounce function")).toBe(false);
  });

  it("ignores whitespace in the query", () => {
    expect(fuzzySubsequence("d e b", "debounce")).toBe(true);
  });
});

describe("fuzzyScore", () => {
  it("rewards consecutive matches over scattered ones", () => {
    expect(fuzzyScore("deb", "debounce")).toBeGreaterThan(fuzzyScore("deb", "dxebyxbox"));
  });

  it("scores a perfect run at 1 and returns 0 for non-matches", () => {
    expect(fuzzyScore("deb", "debounce")).toBe(1);
    expect(fuzzyScore("zzz", "debounce")).toBe(0);
  });
});

describe("scoreKeyword", () => {
  const snippet = { name: "Debounce function", code: "const d = debounce(fn)", tags: ["js", "utils"] };

  it("weights name > tags > code with reasons", () => {
    const r1 = scoreKeyword(snippet, "debounce");
    expect(r1.score).toBeGreaterThanOrEqual(3);
    expect(r1.reasons.name).toBe(true);

    const r2 = scoreKeyword(snippet, "utils");
    expect(r2.reasons.tags).toBe(true);

    const r3 = scoreKeyword(snippet, "debounce(fn)");
    expect(r3.reasons.code).toBe(true);
  });

  it("falls back to fuzzy when nothing matches exactly", () => {
    const r = scoreKeyword(snippet, "debonce");
    expect(r.score).toBeGreaterThan(0);
    expect(r.reasons.fuzzy).toBe(true);
  });

  it("returns zero for unrelated queries", () => {
    expect(scoreKeyword(snippet, "quantum").score).toBe(0);
    expect(scoreKeyword(snippet, "").score).toBe(0);
  });
});

describe("blendScores", () => {
  it("leans on semantic meaning but respects keyword hits", () => {
    expect(blendScores(0, 1)).toBeCloseTo(0.55);
    expect(blendScores(6, null)).toBeCloseTo(1); // maxed keyword, no embeddings
    expect(blendScores(6, 1)).toBeCloseTo(1);
    expect(blendScores(3, 0.5)).toBeGreaterThan(blendScores(3, 0.4));
  });

  it("treats non-finite semantic scores as absent", () => {
    expect(blendScores(6, undefined)).toBeCloseTo(1);
    expect(blendScores(6, NaN)).toBeCloseTo(1);
  });
});

describe("findHighlightRanges", () => {
  it("marks the phrase and individual words without overlap", () => {
    const ranges = findHighlightRanges("debounce the debounce", "debounce");
    expect(ranges).toEqual([
      { start: 0, end: 8 },
      { start: 13, end: 21 },
    ]);
  });

  it("marks word tokens case-insensitively", () => {
    const ranges = findHighlightRanges("const Debounce = fn", "debounce fn");
    const covered = ranges.some((r) => r.start === 6 && r.end === 14);
    expect(covered).toBe(true);
  });

  it("is safe on empty input", () => {
    expect(findHighlightRanges("", "x")).toEqual([]);
    expect(findHighlightRanges("text", "")).toEqual([]);
  });
});

describe("sortSnippets", () => {
  const list = [
    { id: "a", name: "Beta", createdAt: "2026-01-01", updatedAt: "2026-01-02", copies: 1 },
    { id: "b", name: "Alpha", createdAt: "2026-03-01", updatedAt: "2026-03-01", copies: 0 },
    { id: "c", name: "Gamma", createdAt: "2026-02-01", updatedAt: "2026-02-05", copies: 9 },
  ];

  it("sorts newest/oldest by updatedAt", () => {
    expect(sortSnippets(list, "newest").map((s) => s.id)).toEqual(["b", "c", "a"]);
    expect(sortSnippets(list, "oldest").map((s) => s.id)).toEqual(["a", "c", "b"]);
  });

  it("sorts by name and by copy count", () => {
    expect(sortSnippets(list, "name").map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(sortSnippets(list, "copies").map((s) => s.id)).toEqual(["c", "a", "b"]);
  });
});
