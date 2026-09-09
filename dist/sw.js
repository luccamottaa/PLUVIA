const SHELL = "./index.html";
self.addEventListener("install", event => {
  event.waitUntil(caches.open("pluvia-shell-v1").then(cache => cache.addAll(["./", SHELL, "./styles.css?v=p0-p1-1", "./app.js?v=p0-p1-1", "./logo-mark.png"])));
  self.skipWaiting();
});
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open("pluvia-shell-v1").then(cache => cache.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(SHELL))));
    return;
  }
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
