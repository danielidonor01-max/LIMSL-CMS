// public/sw.js
// App-shell caching, so the CMS opens on a phone with no signal.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: cache the shell, never the data.
//
// In a maintenance system, serving a cached API response is not a convenience,
// it is a safety problem. A machine that read OPERATIONAL an hour ago may be
// isolated and locked out now; a permit that was ACTIVE may have expired. A
// technician shown stale maintenance data has been actively misled, which is
// worse than being told plainly that they are offline. So:
//
//   • /_next/static/* and static assets  → cache-first (immutable, hashed)
//   • navigations (HTML)                 → network-first, cached shell fallback
//   • /api/*                             → NETWORK ONLY. Never cached, ever.
//
// Submissions made while offline are handled separately by the outbox
// (src/lib/offline/outbox.ts), which parks them in localStorage and sends them
// on reconnect — not by this worker.

const VERSION = "limsl-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

const isStaticAsset = (url) =>
  url.pathname.startsWith("/_next/static/") ||
  url.pathname.startsWith("/icons/") ||
  /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Data is never served from cache. Not stale-while-revalidate, not as a
  // fallback — a wrong machine status is worse than no machine status.
  if (url.pathname.startsWith("/api/")) return;

  // Auth must always hit the network; a cached session decision is a security
  // bug waiting to happen.
  if (url.pathname.startsWith("/auth") || url.pathname.includes("/api/auth")) return;

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            // Only cache a genuinely good response; an opaque or errored one
            // would be served forever.
            if (res.ok && res.type === "basic") {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          // The page as it was last seen, if we have it — otherwise a page that
          // says plainly what is happening.
          const cached = await caches.match(request);
          return cached || (await caches.match(OFFLINE_URL)) || Response.error();
        }),
    );
  }
});
