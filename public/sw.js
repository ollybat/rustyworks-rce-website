/* Spinback service worker - makes the site installable and shows a friendly page when
 * the phone is offline. It never caches pages, logins or API answers, so everyone always
 * sees the live site. Change VERSION to force every phone to refresh its saved files. */
const VERSION = 'spinback-app-v3';
const OFFLINE = '/offline.html';
const KEEP = [OFFLINE, '/media/spinback-icon.svg', '/media/icon-192.png', '/media/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(KEEP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                        // Discord, fonts.gstatic, etc: leave alone
  if (/^\/(api|auth|socket\.io|oauth|login|logout)(\/|$)/.test(url.pathname)) return;   // live data: never touched
  if (url.pathname === '/sw.js') return;
  if (req.headers.has('range')) return;

  // Pages: always the live site; the offline page only if the network is down.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  // Pictures and fonts: saved copy first (fast), refreshed in the background.
  if (/^\/(media|fonts)\//.test(url.pathname) || /\.(png|jpe?g|gif|webp|svg|ico|woff2?)$/i.test(url.pathname)) {
    e.respondWith(
      caches.open(VERSION).then((c) =>
        c.match(req).then((hit) => {
          const net = fetch(req).then((res) => { if (res.ok && res.type === 'basic') c.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  // Scripts, styles and data: live version first (so edits land immediately), saved copy only if offline.
  if (/\.(js|css|json)$/i.test(url.pathname)) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
