import { memo } from "react";
import { highlightCode } from "./lib/highlight.js";
import { findHighlightRanges } from "./lib/snippet-search.js";

// DOM-aware <mark> splicing over highlight.js output — same technique as the
// App.jsx helper; kept here so the memoized card is self-contained.
function highlightedCodeHtml(code, language, query) {
  const html = highlightCode(code, language);
  const q = String(query || "").trim();
  if (!q) return { __html: html };
  try {
    const host = document.createElement("template");
    host.innerHTML = html;
    const walker = document.createTreeWalker(host.content, NodeFilter.SHOW_TEXT);
    const targets = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (findHighlightRanges(node.nodeValue, q).length > 0) targets.push(node);
    }
    for (const node of targets) {
      const frag = document.createDocumentFragment();
      let pos = 0;
      const text = node.nodeValue;
      for (const r of findHighlightRanges(text, q)) {
        if (r.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, r.start)));
        const mark = document.createElement("mark");
        mark.textContent = text.slice(r.start, r.end);
        frag.appendChild(mark);
        pos = r.end;
      }
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    }
    return { __html: host.innerHTML };
  } catch {
    return { __html: html };
  }
}

function relativeTime(iso) {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  if (ms < 60000) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// One snippet card. Memoized: during search typing, cards whose props didn't
// change skip re-render entirely — that's the render-cost fix that makes
// 5,000-snippet libraries usable. content-visibility lets the browser skip
// layout/paint for offscreen cards.
const SnippetCard = memo(function SnippetCard({
  snippet,
  query,
  rank,
  selected,
  selectionActive,
  onToggleSelect,
  onView,
  onEdit,
  onCopy,
  onAsk,
  onShare,
  onDelete,
  onTagClick,
}) {
  const { code, name, language, tags, createdAt, updatedAt, copies } = snippet;
  const shown = code.length > 200 ? `${code.slice(0, 200)}…` : code;
  const badge = updatedAt && updatedAt !== createdAt ? `edited ${relativeTime(updatedAt)}` : createdAt ? relativeTime(createdAt) : null;
  const kw = rank?.kw?.reasons || {};

  return (
    <div className={`snippet-card ${selectionActive && selected ? "selected" : ""}`} style={{ contentVisibility: "auto", containIntrinsicSize: "300px" }}>
      {selectionActive && (
        <label className="snippet-select-check" aria-label={`Select ${name}`}>
          <input type="checkbox" checked={selected} onChange={() => onToggleSelect(snippet.id)} />
        </label>
      )}
      <div className="snippet-card-header">
        <h4>{name}</h4>
        {language && <span className="snippet-lang-badge">{language}</span>}
      </div>
      <div className="snippet-meta">
        {badge && <span className="snippet-meta-item" title={createdAt ? `Added ${new Date(createdAt).toLocaleString()}` : undefined}>{badge}</span>}
        {(copies || 0) > 0 && <span className="snippet-meta-item" title="Times copied (counted locally)">📋 {copies}</span>}
      </div>
      {(tags || []).length > 0 && (
        <div className="snippet-tags">
          {tags.map((t) => (
            <button key={t} className="tag-chip" onClick={() => onTagClick(t)} title={`Filter by #${t}`}>#{t}</button>
          ))}
        </div>
      )}
      {query && rank && (
        <div className="rank-bar" title={`Relevance ${(rank.blended * 100).toFixed(0)}%`}>
          <div className="rank-bar-fill" style={{ width: `${Math.round(rank.blended * 100)}%` }} />
          <span className="rank-why">
            {kw.fuzzy ? "fuzzy match" : [kw.name && "name", kw.tags && "tags", kw.code && "code"].filter(Boolean).join(" + ") || "meaning"}
            {rank.sem != null ? ` · semantic ${(rank.sem * 100).toFixed(0)}%` : ""}
          </span>
        </div>
      )}
      <pre className="snippet-card-code">
        <code dangerouslySetInnerHTML={highlightedCodeHtml(shown, language, query)} />
      </pre>
      <div className="snippet-card-footer">
        <button onClick={() => onView(snippet.id)}>👁 View</button>
        <button onClick={() => onEdit(snippet.id)}>✏️ Edit</button>
        <button onClick={() => onCopy(snippet)}>📋 Copy</button>
        <button onClick={() => onAsk(snippet)} title="Ask the AI to explain this snippet">🤖 Ask AI</button>
        <button onClick={() => onShare(snippet)} title="Copy a share link">🔗 Share</button>
        <button className="danger" onClick={() => onDelete(snippet.id)}>🗑️</button>
      </div>
    </div>
  );
});

export default SnippetCard;
