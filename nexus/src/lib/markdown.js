// Enhanced markdown parser for AI responses.
// Splits text into: fenced code blocks, headings, bullet lists, numbered lists,
// horizontal rules, and prose paragraphs with inline formatting.

export function parseSegments(text) {
  if (typeof text !== "string" || !text.trim()) return [];
  const segments = [];
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim().toLowerCase();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      segments.push({ type: "code", lang: lang || "code", code: codeLines.join("\n").replace(/\s+$/, "") });
      continue;
    }

    // Heading: # ... ######
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      segments.push({ type: "heading", level: headingMatch[1].length, content: headingMatch[2] });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      segments.push({ type: "hr" });
      i++;
      continue;
    }

    // Bullet list (collect consecutive lines)
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      segments.push({ type: "bullet-list", items });
      continue;
    }

    // Numbered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i++;
      }
      segments.push({ type: "numbered-list", items });
      continue;
    }

    // Prose paragraph (collect consecutive non-empty, non-special lines)
    if (line.trim()) {
      const paraLines = [];
      while (i < lines.length && lines[i].trim() && !lines[i].trimStart().startsWith("```") && !/^#{1,6}\s/.test(lines[i]) && !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i].trim()) && !/^\s*[-*+]\s+/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i])) {
        paraLines.push(lines[i]);
        i++;
      }
      segments.push({ type: "prose", content: paraLines.join("\n") });
      continue;
    }

    // Blank line
    i++;
  }

  return segments;
}

// First fenced code block, or the whole text when there are no fences.
export function extractFirstCodeBlock(text) {
  const segment = parseSegments(text).find((s) => s.type === "code");
  return segment ? segment.code : typeof text === "string" ? text : "";
}
