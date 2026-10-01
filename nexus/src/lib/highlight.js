// Syntax highlighting via highlight.js — common languages only, so the
// bundle stays lean (~40KB gz). highlight.js HTML-escapes its input, so the
// returned markup is safe to inject via dangerouslySetInnerHTML. Unknown or
// missing languages fall back to escaped plain text.

import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github-dark.css";

export const LANGUAGES = [
  "javascript", "typescript", "jsx", "python", "java", "csharp", "cpp", "c",
  "css", "html", "json", "sql", "bash", "go", "rust", "php", "yaml", "markdown",
];

// highlight.js registerAliias handles most names; jsx lives in the full build,
// so map it to the closest registered grammar we ship.
const ALIASES = { jsx: "javascript", sh: "bash", shell: "bash", yml: "yaml", ts: "typescript", js: "javascript", py: "python" };

export function resolveLanguage(lang) {
  const l = String(lang || "").trim().toLowerCase();
  if (!l) return null;
  return ALIASES[l] || l;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function highlightCode(code, lang) {
  const source = String(code || "");
  const resolved = resolveLanguage(lang);
  if (resolved) {
    try {
      if (hljs.getLanguage(resolved)) {
        return hljs.highlight(source, { language: resolved, ignoreIllegals: true }).value;
      }
    } catch {
      // fall through to plain text
    }
  }
  return escapeHtml(source);
}

// Best-effort auto-detection when the user didn't pick a language (used for
// legacy snippets). Disabled when confidence is low to avoid nonsense.
export function detectLanguage(code) {
  try {
    const result = hljs.highlightAuto(String(code || "").slice(0, 4000));
    return result.relevance >= 8 ? result.language || "" : "";
  } catch {
    return "";
  }
}
