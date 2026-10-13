'use strict';

// CACHE bei JEDER Änderung hochzählen!
const CACHE = 'beurteilung-v1';
const ASSETS = ['./', './index.html', './app.css', './app.js', './vorlagen.js', './jspdf.min.js', './xlsx.full.min.js',
  './manifest.webmanifest', './icon-180.png', './icon-512.png',
  './logo-burkhalter.jpg', './logo-absender.jpg', './logo-tagline.jpg', './logo-group.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit =>
      hit ||
      fetch(e.request).then(resp => {
        const copy = resp.clone();
        if (resp.ok && new URL(e.request.url).origin === location.origin) {
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      })
    )
  );
});
