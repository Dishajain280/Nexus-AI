import { describe, it, expect, beforeEach, vi } from "vitest";

// localStorage stub — the lib guards everything behind try/catch, so a plain
// in-memory Map stub is enough for the happy paths and the throwing paths.
class MemStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

let store;
beforeEach(() => {
  store = new MemStorage();
  vi.stubGlobal("localStorage", store);
  vi.resetModules();
});

async function loadLib() {
  return import("./storage.js");
}

describe("storageKeys", () => {
  it("namespaces every key under nexus:", async () => {
    const { storageKeys } = await loadLib();
    for (const key of Object.values(storageKeys)) {
      expect(key.startsWith("nexus:")).toBe(true);
    }
  });
});

describe("normalizeSnippet", () => {
  it("keeps valid snippets and lowercases/dedupes tags", async () => {
    const { normalizeSnippet } = await loadLib();
    const out = normalizeSnippet({ id: "a1", name: " Debounce ", code: "const d=...", tags: ["JS", "js", " React ", ""] });
    expect(out).toEqual({ id: "a1", name: "Debounce", code: "const d=...", tags: ["js", "react"] });
  });

  it("rejects junk and backfills name when only code exists", async () => {
    const { normalizeSnippet } = await loadLib();
    expect(normalizeSnippet(null)).toBeNull();
    expect(normalizeSnippet({ name: "", code: "" })).toBeNull();
    const onlyCode = normalizeSnippet({ code: "x=1" });
    expect(onlyCode.name).toBe("Untitled snippet");
    expect(onlyCode.id).toBeTruthy();
  });

  it("caps tags at 8", async () => {
    const { normalizeSnippet } = await loadLib();
    const out = normalizeSnippet({ name: "n", code: "c", tags: Array.from({ length: 12 }, (_, i) => `t${i}`) });
    expect(out.tags).toHaveLength(8);
  });
});

describe("normalizeTopic", () => {
  it("defaults missing fields and clamps progress", async () => {
    const { normalizeTopic } = await loadLib();
    const out = normalizeTopic({ name: "Recursion", progress: 250 });
    expect(out.status).toBe("pending");
    expect(out.progress).toBe(100);
    expect(out.subTasks).toEqual([]);
    expect(out.notes).toBe("");
  });

  it("rejects invalid status and empty names", async () => {
    const { normalizeTopic } = await loadLib();
    expect(normalizeTopic({ name: "x", status: "archived" }).status).toBe("pending");
    expect(normalizeTopic({ name: "  " })).toBeNull();
    expect(normalizeTopic(42)).toBeNull();
  });

  it("keeps valid statuses and drops malformed learnedAt", async () => {
    const { normalizeTopic } = await loadLib();
    const ok = normalizeTopic({ name: "CSS Grid", status: "completed", learnedAt: "2026-01-15T10:00:00Z" });
    expect(ok.status).toBe("completed");
    expect(ok.learnedAt).toBe("2026-01-15T10:00:00Z");
    expect(normalizeTopic({ name: "y", learnedAt: "not-a-date" }).learnedAt).toBe("");
  });
});

describe("normalizeThread", () => {
  it("keeps valid threads, preserves tool events, and tolerates empty messages", async () => {
    const { normalizeThread } = await loadLib();
    const thread = {
      id: "t1",
      title: "ignored — derived instead",
      at: "2026-02-01T00:00:00Z",
      messages: [
        { role: "user", content: "what is debounce?" },
        { role: "assistant", content: "It delays a call...", toolEvents: [{ name: "save_snippet", ok: true }] },
        { role: "assistant", content: "" },
      ],
    };
    const out = normalizeThread(thread);
    expect(out.id).toBe("t1");
    expect(out.messages).toHaveLength(3); // role-valid messages are kept verbatim
    expect(out.title).toBe("what is debounce?");
    expect(out.messages[1].toolEvents).toEqual([{ name: "save_snippet", ok: true }]);
  });

  it("returns null when there is nothing restorable", async () => {
    const { normalizeThread } = await loadLib();
    expect(normalizeThread(null)).toBeNull();
    expect(normalizeThread({ id: "t2", messages: [] })).toBeNull(); // no messages at all
    expect(normalizeThread({ messages: [{ role: "user", content: "hi" }] })).toBeNull(); // no id
  });

  it("derives the title from the first user message after the history cap", async () => {
    const { normalizeThread, MAX_CHAT_MESSAGES } = await loadLib();
    const messages = Array.from({ length: MAX_CHAT_MESSAGES + 20 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `m${i}`,
    }));
    const out = normalizeThread({ id: "t4", messages });
    expect(out.messages.length).toBe(MAX_CHAT_MESSAGES);
    expect(out.title).toBe("m20"); // oldest retained message, not the dropped m0
  });
});

describe("readJSON / safeSave", () => {
  it("round-trips values and never throws on corruption", async () => {
    const { readJSON, safeSave, storageKeys } = await loadLib();
    expect(safeSave(storageKeys.snippets, [{ name: "a" }])).toBe(true);
    expect(readJSON(storageKeys.snippets)).toEqual([{ name: "a" }]);
    expect(readJSON(storageKeys.snippets)).toEqual([{ name: "a" }]);
    store.setItem(storageKeys.snippets, "{corrupted");
    expect(readJSON(storageKeys.snippets)).toBeNull();
    expect(readJSON("missing-key")).toBeNull();
  });

  it("reports failure instead of throwing when storage explodes", async () => {
    const { safeSave } = await loadLib();
    store.setItem = () => { throw new Error("QuotaExceeded"); };
    expect(safeSave("nexus:big", { big: true })).toBe(false);
  });
});

describe("clearAppData", () => {
  it("removes only nexus-prefixed keys", async () => {
    const { clearAppData, storageKeys } = await loadLib();
    store.setItem(storageKeys.snippets, "[]");
    store.setItem(storageKeys.threads, "[]");
    store.setItem("unrelated-app:data", "keep me");
    clearAppData();
    expect(store.getItem(storageKeys.snippets)).toBeNull();
    expect(store.getItem(storageKeys.threads)).toBeNull();
    expect(store.getItem("unrelated-app:data")).toBe("keep me");
  });
});
