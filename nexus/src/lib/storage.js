// Safe localStorage helpers for NEXUS.
// All app data lives under the "nexus:" prefix, so "Clear Data" can never
// wipe unrelated keys (e.g. the theme or data from other apps on the origin).

export const STORAGE_PREFIX = "nexus:";

export const storageKeys = {
  snippets: `${STORAGE_PREFIX}codeSnippets`,
  tracker: `${STORAGE_PREFIX}learningTracker`,
  theme: `${STORAGE_PREFIX}theme`,
  chatMessages: `${STORAGE_PREFIX}chatMessages`,
  aiHistory: `${STORAGE_PREFIX}aiHistory`,
};

// Unprefixed keys written by older versions of the app.
const LEGACY_KEYS = {
  snippets: "codeSnippets",
  tracker: "learningTracker",
  theme: "theme",
};

export function isStorageAvailable() {
  try {
    const testKey = `${STORAGE_PREFIX}__test__`;
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

// JSON.parse that never throws: corrupted entries are ignored, not fatal.
export function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch (err) {
    console.warn(`NEXUS: ignoring corrupted "${key}" in localStorage`, err);
    return null;
  }
}

// JSON.stringify + setItem that never throws (quota exceeded / private mode).
export function safeSave(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`NEXUS: failed to save "${key}"`, err);
    return false;
  }
}

// Collision-proof id (Date.now() alone collides within the same millisecond).
let uidCounter = 0;
export function uid() {
  uidCounter = (uidCounter + 1) % 4096;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}-${uidCounter.toString(36)}-${rand}`;
}

const VALID_STATUSES = ["pending", "incomplete", "completed"];

// Backfills fields missing on topics saved by older versions and drops junk.
export function normalizeTopic(topic) {
  if (!topic || typeof topic !== "object") return null;
  const name = typeof topic.name === "string" ? topic.name.trim() : "";
  if (!name) return null;
  const progress = Number(topic.progress);
  return {
    id: topic.id != null ? topic.id : uid(),
    name,
    status: VALID_STATUSES.includes(topic.status) ? topic.status : "pending",
    notes: typeof topic.notes === "string" ? topic.notes : "",
    date: typeof topic.date === "string" ? topic.date : "",
    subTasks: Array.isArray(topic.subTasks) ? topic.subTasks : [],
    progress: Number.isFinite(progress)
      ? Math.min(100, Math.max(0, Math.round(progress)))
      : 0,
  };
}

export function normalizeSnippet(snippet) {
  if (!snippet || typeof snippet !== "object") return null;
  const name = typeof snippet.name === "string" ? snippet.name.trim() : "";
  const code = typeof snippet.code === "string" ? snippet.code : "";
  if (!name && !code) return null;
  const tags = Array.isArray(snippet.tags)
    ? [...new Set(snippet.tags.map((t) => String(t).trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean))].slice(0, 8)
    : [];
  return {
    id: snippet.id != null ? snippet.id : uid(),
    name: name || "Untitled snippet",
    code,
    tags,
  };
}

function normalizeList(list, normalizer) {
  const seenIds = new Set();
  const result = [];
  for (const item of list) {
    const normalized = normalizer(item);
    if (!normalized) continue;
    const id = String(normalized.id);
    if (seenIds.has(id)) continue; // drop duplicate ids (legacy Date.now collisions)
    seenIds.add(id);
    result.push(normalized);
  }
  return result;
}

// Parse one raw JSON string (localStorage value or storage event) into a
// normalized list. Never throws.
export function parseList(raw, normalizer) {
  if (typeof raw !== "string") return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  return Array.isArray(parsed) ? normalizeList(parsed, normalizer) : [];
}

// Read a list from the first key that holds a valid array (new prefixed key
// first, then legacy keys — older saves are transparently migrated).
export function loadList(keys, normalizer) {
  for (const key of keys) {
    const parsed = readJSON(key);
    if (Array.isArray(parsed)) return normalizeList(parsed, normalizer);
  }
  return [];
}

// The theme written by older versions was a bare string ("dark"); newer
// saves are JSON-quoted. Accept both formats.
export function readTheme() {
  for (const key of [storageKeys.theme, LEGACY_KEYS.theme]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === "dark" || raw === "light") return raw;
      const parsed = JSON.parse(raw);
      if (parsed === "dark" || parsed === "light") return parsed;
    } catch {
      // try the next key
    }
  }
  return null;
}

// Remove only NEXUS data (snippets + tracker). The theme is preserved on
// purpose, and nothing outside the app's own keys is touched.
export function clearAppData() {
  const keys = [
    storageKeys.snippets,
    storageKeys.tracker,
    storageKeys.chatMessages,
    storageKeys.aiHistory,
    LEGACY_KEYS.snippets,
    LEGACY_KEYS.tracker,
  ];
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

// Maximum messages kept in the persisted chat.
export const MAX_CHAT_MESSAGES = 100;
