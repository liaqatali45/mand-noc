/* Mand NOC - service worker
   Makes the software installable as an app.
   - The app page (index.html) is always fetched fresh from the internet first,
     so every upload of a new index.html reaches all computers automatically.
     The saved copy is used only when the internet is down (the login page
     still opens, but NOC data needs the internet).
   - Libraries, fonts and icons are kept in a cache for faster start.
   - Database requests (Supabase) are never cached. */
const VERSION = 'mand-noc-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (/supabase\.co$/i.test(url.hostname) || url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) return;

  // App page: network first, cached copy only when offline
  if (req.mode === 'navigate' || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  // Libraries, fonts, icons: cached copy at once, refreshed in the background
  const cacheable = url.origin === location.origin ||
    /(^|\.)(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/i.test(url.hostname);
  if (!cacheable) return;
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
