/* Mand NOC - service worker
   - Makes the software installable and lets it open without internet.
   - The app page (index.html) is fetched fresh first, so every upload of a new
     index.html reaches all computers. If the internet is down or very slow
     (more than 6 seconds), the copy saved on the computer is used.
   - Fonts and icons are saved on the computer for offline use (the libraries
     are inside index.html).
   - Database requests (Supabase) are never cached here; offline data is kept
     by the app itself. */
const VERSION = 'mand-noc-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './icons/favicon-32.png', './icons/apple-touch-icon.png'];
// Libraries are now built into index.html, nothing extra to download.
const CDN = [];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(SHELL);
    await Promise.all(CDN.map(u => fetch(u, {mode: 'no-cors'}).then(r => c.put(u, r)).catch(() => {})));
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const timeout = (p, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); p.then(v => { clearTimeout(t); res(v); }, x => { clearTimeout(t); rej(x); }); });

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (/supabase\.co$/i.test(url.hostname) || url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) return;

  // App page: internet first, saved copy when offline or too slow
  if (req.mode === 'navigate' || (url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      try {
        const res = await timeout(fetch(req, {cache: 'no-store'}), 6000);
        if (res && res.ok) c.put('./index.html', res.clone());
        return res;
      } catch (err) {
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Libraries, fonts, icons: saved copy at once, refreshed in the background
  const cacheable = url.origin === location.origin ||
    /(^|\.)(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/i.test(url.hostname);
  if (!cacheable) return;
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, {ignoreVary: true});
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; })
      .catch(() => hit || Response.error());
    return hit || net;
  }));
});
