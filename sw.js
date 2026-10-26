// Bump this on every release so installed clients pick up the new fretline.html
// (activate clears any cache under an older name and re-precaches).
const CACHE_NAME = "fretline-v18";

const PRECACHE_URLS = [
  "./index.html",
  "./embed.js",
  "./fl-audio.js",
  "./fl-notes.js",
  "./piano.html",
  "./chord-patterns.js",
  "./shapes_lab.html",
  "./fretline.html",
  "./ear_training.html",
  "./scale_lab.html",
  "./harmony_map.html",
  "./posture.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first, falling back to the cache only when offline (and always
// refreshing the cache from a successful network response) — so an online
// viewer always gets the current fretline.html, never a stale precached
// copy, while offline use still works from whatever was last cached.
// cache: "no-cache" makes the browser check with the server every time instead of reusing its own HTTP cache: GitHub
// Pages sends max-age=600, so a plain fetch() kept serving the previous release for up to 10 minutes after a push.
// When nothing changed, the check is a tiny 304 (Pages sends an ETag), so this costs almost nothing.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
