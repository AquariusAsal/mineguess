// MineGuess Service Worker — Offline Support
const CACHE = 'mineguess-v2';
const ASSETS = [
  '/game.html',
  '/multiplayer.html',
  '/index.html',
  '/premium.html',
  '/logo-green.png',
  '/logo-transparent.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network-first for Firebase/API calls; cache-first for assets
  const url = new URL(e.request.url);
  const isApi = url.hostname.includes('firebase') || url.hostname.includes('googleapis.com') || url.pathname.includes('firebase-config');
  if (isApi) return; // let Firebase go through normally

  e.respondWith(
    caches.match(e.request).then(cached => {
      const net = fetch(e.request).then(res => {
        if (res && res.status === 200 && e.request.method === 'GET') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
