const CACHE_NAME = "cooler-scan-shell-v7";
const SHELL_FILES = [
  "/scan",
  "/static/style.css",
  "/static/scan.js",
  "/static/jsQR.js",
  "/static/manifest.json",
  "/static/icon-192.png",
  "/static/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache live data -- always hit the LAN server directly.
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // App shell: network-first, falling back to the cached copy only if the
  // network request fails (offline). This used to be cache-first, which
  // caches each shell file independently -- that let a phone end up with,
  // say, an old cached /scan page paired with a newer cached scan.js (or
  // vice versa) after a deploy, since each file could get refreshed at a
  // different time. A JS error from that mismatch (a button element the
  // old HTML doesn't have yet, referenced by the new script) can silently
  // break every button on the page. Trying the network first means normal
  // online use always gets the current, matched set of files straight
  // from the server; the cache is purely a fallback for working with no
  // signal at all (see README).
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
