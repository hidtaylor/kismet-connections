// Kismet service worker — caches the app shell for offline.
// Data (DB, storage, AI calls) is intentionally network-only in v1.

const CACHE = 'kismet-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache API/auth/storage/edge calls — always live network.
  if (
    url.hostname.endsWith('.supabase.co') ||
    url.pathname.startsWith('/~oauth') ||
    url.pathname.startsWith('/auth/')
  ) {
    return;
  }

  // App shell: navigation requests fall back to cached index.html when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets: cache-first, fall through to network.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      // Only cache same-origin successful responses.
      if (res.ok && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => cached))
  );
});
