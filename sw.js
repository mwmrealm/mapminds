/* MapMinds service worker
   - app shell: precached, stale-while-revalidate
   - map tiles: cache-first, size-capped
   - live APIs (Overpass / routing): always network
   Bump VERSION whenever any precached file changes. */
const VERSION = 'v12';
const SHELL = 'mm-shell-' + VERSION;
const TILES = 'mm-tiles';
const TILE_MAX = 900;

const SHELL_FILES = [
  './', './index.html', './config.js', './app.js', './nav.js', './qr.js', './editor.js', './i18n.js', './i18n-extra.js', './styles.css', './tailwind.css', './manifest.json',
  './campus-places.csv', './data/places.json', './campus-graph.json', './logo.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/favicon-32.png', './icons/apple-touch-icon.png',
  './vendor/pinyin-pro.js', './vendor/lib/jsqr.min.js', './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/marker-icon.png', './vendor/leaflet/images/marker-shadow.png', './vendor/leaflet/images/layers.png',
  './vendor/fa/css/all.min.css', './vendor/fa/webfonts/fa-solid-900.woff2', './vendor/fa/webfonts/fa-regular-400.woff2'
];

const isTileHost = h => h === 'tile.openstreetmap.org' || h === 'tile.openstreetmap.de' || h.endsWith('.tile.openstreetmap.fr') || h === 'server.arcgisonline.com' || h.endsWith('.basemaps.cartocdn.com') || h.endsWith('.tianditu.gov.cn') || h === 'api.maptiler.com' || h === 'tiles.stadiamaps.com';
const isLiveHost = h => ['overpass-api.de', 'overpass.kumi.systems', 'overpass.private.coffee', 'overpass.nchc.org.tw', 'overpass.openstreetmap.fr', 'overpass.osm.jp', 'maps.mail.ru', 'routing.openstreetmap.de', 'valhalla1.openstreetmap.de'].includes(h);

self.addEventListener('install', e => {
  // addAll is all-or-nothing on purpose: a half-installed shell would break offline use silently
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('mm-shell-') && k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

async function trimTiles(cache) {
  const keys = await cache.keys();
  if (keys.length > TILE_MAX) await Promise.all(keys.slice(0, keys.length - TILE_MAX).map(k => cache.delete(k)));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (isLiveHost(url.hostname)) return;                       // live data: network only

  if (isTileHost(url.hostname)) {                             // tiles: cache first, remember good ones
    e.respondWith(caches.open(TILES).then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) { cache.put(req, res.clone()); trimTiles(cache); }
        return res;
      } catch (err) { return new Response('', { status: 504, statusText: 'offline' }); }
    }));
    return;
  }

  if (url.origin !== location.origin) return;                 // never touch other third parties
  if (/\/(admin\.(html|js)|config\.js)$/.test(url.pathname)) return;        // admin tool: always fresh

  if (url.pathname.endsWith('/data/places.json')) {           // place data: network first so new places show at once, cache when offline
    e.respondWith(fetch(req).then(res => { if (res && res.ok) { const c = res.clone(); caches.open(SHELL).then(ca => ca.put(req, c)); } return res; })
      .catch(() => caches.open(SHELL).then(ca => ca.match(req, { ignoreSearch: true })).then(h => h || new Response('{"places":[]}', { headers: { 'Content-Type': 'application/json' } }))));
    return;
  }

  // app shell + same-origin data: stale-while-revalidate, with an offline fallback
  e.respondWith(caches.open(SHELL).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    const net = fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { net.catch(() => {}); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') { const idx = await cache.match('./index.html'); if (idx) return idx; }
    return new Response('Offline', { status: 503, statusText: 'offline' });
  }));
});