// Semantic snippet search for NEXUS.
// Snippet name+code are embedded via the /api/gemini proxy
// (text-embedding-004), vectors are stored in IndexedDB (localStorage is for
// structured data — vectors are bulky and indexed lookups belong in IDB),
// and queries rank by cosine similarity. Hash-based invalidation: a snippet
// is re-embedded only when its content actually changed.

const DB_NAME = "nexus-semantic";
const STORE = "vectors";
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
  });
}

// ---- Vector store ----

export async function getAllVectors() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => reject(req.error);
  });
}

export async function putVectors(entries) {
  if (entries.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  for (const e of entries) store.put(e);
  await txDone(tx);
}

export async function deleteVectors(ids) {
  if (ids.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  for (const id of ids) store.delete(id);
  await txDone(tx);
}

// ---- Embedding via the existing serverless proxy ----

async function embedTexts(texts) {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      texts.length === 1 ? { embed: { text: texts[0] } } : { embeds: { inputs: texts } },
    ),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Embedding failed (HTTP ${res.status})`);

  if (texts.length === 1) {
    const values = data?.embedding?.values;
    if (!Array.isArray(values)) throw new Error("Malformed embedding response.");
    return [values];
  }
  const vectors = (data?.embeddings || []).map((e) => e?.values).filter(Array.isArray);
  if (vectors.length !== texts.length) throw new Error("Malformed batch embedding response.");
  return vectors;
}

// Stable content hash for invalidation (FNV-1a — fast, no deps).
function hashText(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const snippetText = (s) => `${s.name}\n\n${(s.tags || []).join(", ")}\n\n${(s.code || "").slice(0, 3000)}`;

// Bring the vector store in sync with the current snippets. Only new/changed
// snippets are embedded (batched); deleted snippets are pruned. Returns the
// number of embeddings generated this run.
export async function syncSnippetVectors(snippets) {
  const existing = await getAllVectors().catch(() => []);
  const byId = new Map(existing.map((v) => [v.id, v]));

  const staleIds = existing
    .filter((v) => !snippets.some((s) => String(s.id) === v.id))
    .map((v) => v.id);
  await deleteVectors(staleIds);

  const toEmbed = [];
  for (const s of snippets) {
    const id = String(s.id);
    const hash = hashText(snippetText(s));
    if (byId.get(id)?.hash === hash) continue;
    toEmbed.push({ id, hash, text: snippetText(s) });
  }

  let generated = 0;
  const BATCH = 16; // proxy caps at 32; stay comfortably under
  const fresh = [];
  for (let i = 0; i < toEmbed.length; i += BATCH) {
    const batch = toEmbed.slice(i, i + BATCH);
    const vectors = await embedTexts(batch.map((b) => b.text));
    batch.forEach((b, j) => fresh.push({ id: b.id, hash: b.hash, vector: vectors[j] }));
    generated += batch.length;
  }
  await putVectors(fresh);
  return { generated, total: snippets.length };
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Rank snippets against a natural-language query. Falls back to keyword
// matching if embeddings are unavailable (private mode, no key, offline).
export async function semanticSearch(snippets, query, { semantic = true } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];

  let vectors = [];
  if (semantic) {
    try {
      await syncSnippetVectors(snippets);
      vectors = await getAllVectors();
    } catch {
      vectors = []; // graceful fallback below
    }
  }

  if (vectors.length > 0) {
    try {
      const [queryVec] = await embedTexts([q]);
      const byId = new Map(vectors.map((v) => [v.id, v.vector]));
      return snippets
        .map((s) => {
          const vec = byId.get(String(s.id));
          return vec ? { snippet: s, score: cosine(queryVec, vec) } : null;
        })
        .filter(Boolean)
        .filter((r) => r.score > 0.3) // noise floor — unrelated snippets drop out
        .sort((a, b) => b.score - a.score)
        .map((r) => r.snippet);
    } catch {
      // fall through to keyword search
    }
  }

  // Keyword fallback (name > tags > code).
  const lower = q.toLowerCase();
  return snippets
    .map((s) => {
      const name = s.name.toLowerCase().includes(lower) ? 3 : 0;
      const tags = (s.tags || []).some((t) => t.includes(lower)) ? 2 : 0;
      const code = (s.code || "").toLowerCase().includes(lower) ? 1 : 0;
      return { snippet: s, score: name + tags + code };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.snippet);
}
