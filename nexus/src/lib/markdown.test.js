import { describe, it, expect } from "vitest";
import { parseSegments, extractFirstCodeBlock } from "./markdown.js";

describe("parseSegments", () => {
  it("returns empty for empty/non-string input", () => {
    expect(parseSegments("")).toEqual([]);
    expect(parseSegments("   \n  ")).toEqual([]);
    expect(parseSegments(null)).toEqual([]);
  });

  it("detects fenced code blocks with language", () => {
    const segs = parseSegments("Before\n```js\nconst a = 1;\nconst b = 2;\n```\nAfter");
    expect(segs).toHaveLength(3);
    expect(segs[1]).toEqual({ type: "code", lang: "js", code: "const a = 1;\nconst b = 2;" });
  });

  it("treats an unterminated fence as code to the end", () => {
    const segs = parseSegments("```python\nprint('hi')");
    expect(segs).toEqual([{ type: "code", lang: "python", code: "print('hi')" }]);
  });

  it("splits headings, bullets, numbered lists, prose, and hr", () => {
    const md = [
      "## Setup",
      "",
      "- install deps",
      "- run dev server",
      "",
      "1. first",
      "2. second",
      "",
      "Some prose explanation",
      "spanning two lines.",
      "",
      "---",
    ].join("\n");
    const segs = parseSegments(md);
    expect(segs.map((s) => s.type)).toEqual(["heading", "bullet-list", "numbered-list", "prose", "hr"]);
    expect(segs[0]).toEqual({ type: "heading", level: 2, content: "Setup" });
    expect(segs[1].items).toEqual(["install deps", "run dev server"]);
    expect(segs[3].content).toBe("Some prose explanation\nspanning two lines.");
  });

  it("never emits dangerously raw HTML as a type", () => {
    const segs = parseSegments("<script>alert(1)</script>");
    expect(segs[0].type).toBe("prose"); // rendered as escaped text, not html
  });
});

describe("extractFirstCodeBlock", () => {
  it("returns the first fenced block only", () => {
    const md = "text\n```\nfirst\n```\nmid\n```\nsecond\n```";
    expect(extractFirstCodeBlock(md)).toBe("first");
  });

  it("falls back to the whole text when there are no fences", () => {
    expect(extractFirstCodeBlock("just prose")).toBe("just prose");
    expect(extractFirstCodeBlock(42)).toBe("");
  });
});
