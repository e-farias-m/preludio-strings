const CACHE = 'preludio-strings-v7';
// Relative to the service worker's own folder, so the app works from a
// project page (user.github.io/repo/) as well as from a domain root.
const FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './css/styles.css',
  './js/app.js',
  './js/audio.js',
  './js/curriculum.js',
  './js/graphics.js',
  './js/i18n.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )),
    ])
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const clone = res.clone();
      if (res.ok) caches.open(CACHE).then(cache => cache.put(e.request, clone));
      return res;
    }))
  );
});
