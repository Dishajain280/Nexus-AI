// Snippet search scoring: keyword (name > tags > code), fuzzy fallback for
// typos, and hybrid blending with the semantic (cosine) score from
// lib/semantic.js. Pure functions — unit-tested in snippet-search.test.js.

// Subsequence match: every query char appears in order (not necessarily
// adjacent) in the text. "debonce" matches "debounce function" — typo-proof.
export function fuzzySubsequence(query, text) {
  const q = String(query || "").toLowerCase().replace(/\s+/g, "");
  const t = String(text || "").toLowerCase();
  if (!q) return false;
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return i === q.length;
}

// Fuzzy quality 0..1: rewards runs of consecutive matched chars, so
// "debounce" scores higher against "debounce" than against "ddoevbounce".
export function fuzzyScore(query, text) {
  const q = String(query || "").toLowerCase().replace(/\s+/g, "");
  const t = String(text || "").toLowerCase();
  if (!q || !fuzzySubsequence(q, t)) return 0;
  let i = 0;
  let streak = 0;
  let score = 0;
  for (const ch of t) {
    if (i < q.length && ch === q[i]) {
      i++;
      streak++;
      score += streak;
    } else {
      streak = 0;
    }
  }
  const maxSame = (q.length * (q.length + 1)) / 2; // all chars matched consecutively
  return score / maxSame;
}

// Keyword score with per-field reasons: name 3, tag 2, code 1. If nothing
// matched exactly, fall back to fuzzy (score 0.5..1.5) so a typo still
// surfaces results instead of an empty page.
export function scoreKeyword(snippet, query) {
  const q = String(query || "").trim().toLowerCase();
  const reasons = { name: false, tags: false, code: false, fuzzy: false };
  if (!q) return { score: 0, reasons };
  let score = 0;
  if (String(snippet.name || "").toLowerCase().includes(q)) { score += 3; reasons.name = true; }
  if ((snippet.tags || []).some((t) => t.includes(q))) { score += 2; reasons.tags = true; }
  if (String(snippet.code || "").toLowerCase().includes(q)) { score += 1; reasons.code = true; }
  // Fuzzy fallback only for 3+ chars: 1–2 char queries are subsequence-matched
  // by nearly every snippet, which buries good results and wastes cycles.
  if (score === 0 && q.length >= 3) {
    const f = Math.max(fuzzyScore(q, snippet.name || ""), fuzzyScore(q, snippet.code || ""));
    if (f > 0) { score = 0.5 + f; reasons.fuzzy = true; }
  }
  return { score, reasons };
}

// Blend keyword and semantic signals into one 0..1 relevance. Meaning leads
// (0.55) but exact keyword hits pull hard (0.45); without embeddings the
// keyword score stands alone.
export function blendScores(keywordScore, semanticScore) {
  const kwNorm = Math.min(keywordScore / 6, 1);
  if (semanticScore == null || !Number.isFinite(semanticScore)) return kwNorm;
  return 0.55 * Math.max(0, Math.min(1, semanticScore)) + 0.45 * kwNorm;
}

// Case-insensitive highlight ranges for the query (whole phrase first, then
// individual words), merged and non-overlapping so longer matches win.
export function findHighlightRanges(text, query, { max = 20 } = {}) {
  const t = String(text || "");
  const q = String(query || "").trim().toLowerCase();
  if (!t || !q) return [];
  const lower = t.toLowerCase();
  const ranges = [];
  const overlaps = (s, e) => ranges.some((r) => s < r.end && e > r.start);

  const addAll = (needle) => {
    let idx = lower.indexOf(needle);
    while (idx !== -1 && ranges.length < max) {
      if (!overlaps(idx, idx + needle.length)) ranges.push({ start: idx, end: idx + needle.length });
      idx = lower.indexOf(needle, idx + needle.length);
    }
  };
  addAll(q);
  for (const tok of [...new Set(q.split(/\s+/).filter((w) => w.length >= 2))].sort((a, b) => b.length - a.length)) {
    addAll(tok);
  }
  return ranges.sort((a, b) => a.start - b.start);
}

export function sortSnippets(list, sort) {
  const byIso = (s) => Date.parse(s.updatedAt || s.createdAt) || 0;
  switch (sort) {
    case "oldest": return [...list].sort((a, b) => byIso(a) - byIso(b));
    case "name": return [...list].sort((a, b) => a.name.localeCompare(b.name));
    case "copies": return [...list].sort((a, b) => (b.copies || 0) - (a.copies || 0) || byIso(b) - byIso(a));
    case "newest":
    default: return [...list].sort((a, b) => byIso(b) - byIso(a));
  }
}
