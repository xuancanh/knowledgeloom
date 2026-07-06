/**
 * Knowledge Loom service worker — offline shell + fast static assets.
 *
 * Strategy:
 *  - Navigations: network-first, falling back to the cached app shell so the
 *    app opens (with cached data where pages fetch it) when offline.
 *  - Same-origin static assets (js/css/fonts/images): stale-while-revalidate.
 *  - /api requests are NEVER intercepted — data freshness and auth semantics
 *    stay exactly as the app implements them.
 */
const VERSION = 'kl-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // never cache or intercept data

  // App navigations: try the network, fall back to the cached shell.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put('/', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (['script', 'style', 'font', 'image'].includes(event.request.destination)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const refresh = fetch(event.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(event.request, copy)).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || refresh;
      }),
    );
  }
});
