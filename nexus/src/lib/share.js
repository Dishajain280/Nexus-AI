// Shareable snippet links — the whole snippet lives in the URL fragment
// (#/s/<base64url>), so sharing needs zero backend and nothing is uploaded
// anywhere. Fragments are never sent to servers, including ours.

export function encodeSnippetToHash(snippet) {
  const payload = {
    n: String(snippet?.name || "Untitled snippet").slice(0, 80),
    c: String(snippet?.code || "").slice(0, 20000),
    t: Array.isArray(snippet?.tags) ? snippet.tags.slice(0, 8) : [],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `#/s/${b64}`;
}

export function decodeSnippetFromHash(hash) {
  try {
    const m = /^#\/s\/([A-Za-z0-9_-]+)$/.exec(String(hash || ""));
    if (!m) return null;
    let b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    const name = typeof payload?.n === "string" ? payload.n.trim() : "";
    const code = typeof payload?.c === "string" ? payload.c : "";
    if (!name && !code) return null;
    const tags = Array.isArray(payload?.t) ? payload.t.map((t) => String(t).toLowerCase()).filter(Boolean) : [];
    return { name: name || "Untitled snippet", code, tags };
  } catch {
    return null;
  }
}
