const CACHE = "pluvia-core-37";
const SHELL = "./index.html";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["./", SHELL, "./analytics.js?v=analytics-1", "./styles.css?v=core-37", "./capitals.js?v=core-37", "./app.js?v=core-37", "./p0.js?v=core-37", "./account.js?v=core-37", "./modules/sources.js?v=core-37", "./modules/risks.js?v=core-37", "./modules/adapters.js?v=core-37", "./manifest.webmanifest", "./logo-mark.png", "./logo-pluvia.png"])));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("pluvia-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    return; // Auth e APIs externas nunca entram no cache do SW.
  }
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).then(res => {
      if (!res.ok) return res;
      const copy = res.clone();
      caches.open(CACHE).then(cache => cache.put(SHELL, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(SHELL)));
    return;
  }
  if (url.pathname.endsWith("/municipalities.js") || url.pathname.endsWith("/municipality-index.js") || /\/cities\/[a-z]{2}\.js$/.test(url.pathname)) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (!res.ok) return res;
      const copy = res.clone();
      caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
      return res;
    })));
    return;
  }
  if (/\.(js|css)(\?|$)/.test(url.pathname + url.search) || url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
    event.respondWith(fetch(req).then(res => {
      if (!res.ok) return res;
      const copy = res.clone();
      caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req)));
    return;
  }
  event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (!res.ok) return res;
    const copy = res.clone();
    caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
    return res;
  }).catch(() => Response.error())));
});
