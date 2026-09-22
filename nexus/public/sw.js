// NEXUS service worker — offline-first app shell.
// Strategy:
//   • Navigations & static assets: network-first, cache fallback. The latest
//     deploy wins when online; the cache keeps the app usable offline.
//   • /api/*: never cached (always live).
//   • Fonts: stale-while-revalidate.
const CACHE = "nexus-v1";
const SHELL = ["/", "/home", "/ai", "/snippets", "/tracker", "/settings", "/favicon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled(SHELL.map((url) => cache.add(url))),
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return; // live only

  // Fonts: stale-while-revalidate.
  if (url.hostname.endsWith("gstatic.com")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request).then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        });
        return cached || fetchPromise;
      }),
    );
    return;
  }

  // Same-origin + navigations: network-first, cache fallback.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && (url.origin === self.location.origin || request.mode === "navigate")) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const shell = await caches.match("/index.html");
          if (shell) return shell;
        }
        return new Response("Offline and not cached.", { status: 503, statusText: "Offline" });
      }),
  );
});
