/**
 * d'Gaddi's Health Monitoring — Service Worker
 * ------------------------------------
 * Makes the app itself (not just its data) available with no network at
 * all: on first successful load it caches this page plus the CDN scripts
 * and font stylesheet it depends on (React, ReactDOM, Babel standalone,
 * Google Fonts). After that those are served from cache first, so the
 * app opens instantly and works offline — even on airplane mode.
 *
 * IMPORTANT — two different caching strategies on purpose:
 *   - This app's OWN code (index.html, manifest.json) uses NETWORK-FIRST.
 *     Cache-first for these was the actual cause of more than one
 *     "I pushed a fix but it's still broken" report during development —
 *     a device that had already cached an old index.html would keep
 *     serving that old version indefinitely, no matter how many times the
 *     file was updated and redeployed, since cache-first never even asks
 *     the network unless the cache is empty. Network-first fixes that:
 *     when online, you always get the latest code; the cache is only used
 *     as a fallback if the network request actually fails (true offline).
 *   - CDN libraries and icons (which essentially never change) stay
 *     cache-first, for the instant-load / offline benefit with none of
 *     the staleness risk, since their content is static.
 *
 * The data layer (vitals, medications, profile, etc.) is handled
 * separately inside index.html via localStorage + a sync queue; this file
 * only concerns itself with making the page's own assets load offline.
 *
 * Bump CACHE_NAME any time you change PRECACHE_URLS so old caches get
 * cleaned up on the next visit.
 */

const CACHE_NAME = "dgaddis-health-monitoring-v4";

const PRECACHE_URLS = [
  "./",
  "index.html",
  "manifest.json",
  "icons/icon-header.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "icons/favicon-16.png",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone/babel.min.js",
  "https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Roboto:wght@400;500;700;900&display=swap",
];

// Requests that must always prefer the network — this app's own code.
function isAppCode(url) {
  return (
    url.endsWith("/") ||
    url.endsWith("index.html") ||
    url.endsWith("manifest.json")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // allSettled so one blocked/slow resource doesn't fail the whole install
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // Never cache or intercept calls to the Apps Script backend — those must
  // always hit the real network so the app can tell whether it's online.
  if (url.indexOf("script.google.com") !== -1) return;

  if (event.request.method !== "GET") return;

  if (isAppCode(url)) {
    // Network-first: always get the latest index.html when online. Only
    // fall back to whatever's cached if the network request itself fails
    // (genuinely offline), so the app still opens with no connection.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else (CDN libraries, icons) — static
  // content that benefits from instant loading with no staleness risk.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
