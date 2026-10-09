// Offline-first cache for the app shell.
//
// Published site (github.io): cache first. The app starts from the device
// with no network wait; a new release is picked up when the browser sees a
// changed sw.js (bump VERSION), precaches it in the background and serves
// it from the next launch.
// Dev preview (localhost / Tailscale): network first, so edits show at once.
const VERSION = 'rpn-2.4.0'; // keep in sync with version.js
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'core.js',
  'history.js',
  'version.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
];
const DEV = !self.location.hostname.endsWith('github.io');

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the HTTP cache so a release never mixes old files.
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function fromNetwork(req) {
  return fetch(req).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
    }
    return res;
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  // Explicit "ask the server" requests (the update check) bypass the cache.
  if (req.cache === 'no-store' || req.cache === 'reload') return;
  if (DEV) {
    e.respondWith(fromNetwork(req).catch(() => caches.match(req, { ignoreSearch: true })));
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fromNetwork(req)),
  );
});
