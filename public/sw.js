// Service worker estándar del ecosistema (§3): navegación network-first (los
// deploys se ven al instante; offline cae a caché), resto cache-first con refresco
// en segundo plano. Subir N de CACHE en cada cambio de assets cacheados.
// `self` es el ServiceWorkerGlobalScope; el lib WebWorker de TypeScript lo tipa como el
// ámbito genérico de un worker, así que se dice aquí una vez.
const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

const CACHE = 'trivia-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

sw.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  sw.skipWaiting();
});

sw.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => sw.clients.claim())
  );
});

sw.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  // Nunca interceptar otros orígenes (store.dotrino.com, jsDelivr, GoatCounter…).
  if (url.origin !== sw.location.origin) return;

  const isNavigation = e.request.mode === 'navigate' || e.request.destination === 'document';
  if (isNavigation) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request).then(c => c || caches.match('./index.html')).then(c => c || Response.error()))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
