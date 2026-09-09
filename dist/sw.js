const CACHE = "pluvia-shell-v3";
const SHELL = "./index.html";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(["./", SHELL, "./logo-mark.png"])));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  if (/\.(js|css)(\?|$)/.test(url.pathname + url.search) || url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
    event.respondWith(fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req)));
    return;
  }
  event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
    return res;
  }).catch(() => caches.match(SHELL))));
});
