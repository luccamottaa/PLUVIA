const CACHE = "pluvia-core-58";
const SHELL = "./index.html";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([
    "./", SHELL, "./analytics.js?v=analytics-2", "./styles.css?v=core-57", "./capitals.js?v=core-47", "./app.js?v=core-56", "./p0.js?v=core-47", "./account.js?v=core-58", "./notifications.js?v=push-2", "./weather-map.js?v=core-47",
    "./modules/sources.js?v=core-47", "./modules/weather-data-layer.js?v=core-55", "./modules/weather-insights.js?v=core-56", "./modules/signal.js?v=core-47", "./modules/smart-summary.js?v=core-49", "./modules/weather-icons.js?v=core-49", "./modules/weather-icon-system.js?v=glossy-2", "./modules/risks.js?v=core-47", "./modules/adapters.js?v=core-47",
    "./manifest.webmanifest", "./logo-mark.png", "./logo-pluvia.png", "./favicon-32.png", "./apple-touch-icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-192.png", "./icon-maskable-512.png",
    "./vendor/weathericons/Sun.svg", "./vendor/weathericons/Moon.svg", "./vendor/weathericons/PartlySunny.svg", "./vendor/weathericons/PartlyMoon.svg", "./vendor/weathericons/Cloud.svg", "./vendor/weathericons/Haze.svg", "./vendor/weathericons/Rain.svg", "./vendor/weathericons/Snow.svg", "./vendor/weathericons/Storm.svg", "./vendor/weathericons/Hail.svg",
    "./assets/weather-icons/conditions/clear-day.png", "./assets/weather-icons/conditions/clear-night.png", "./assets/weather-icons/conditions/partly-cloudy-day.png", "./assets/weather-icons/conditions/partly-cloudy-night.png", "./assets/weather-icons/conditions/cloudy.png", "./assets/weather-icons/conditions/overcast.png", "./assets/weather-icons/conditions/fog.png", "./assets/weather-icons/conditions/haze.png", "./assets/weather-icons/conditions/light-rain.png", "./assets/weather-icons/conditions/moderate-rain.png", "./assets/weather-icons/conditions/heavy-rain.png", "./assets/weather-icons/conditions/showers.png", "./assets/weather-icons/conditions/thunderstorm.png", "./assets/weather-icons/conditions/thunderstorm-rain.png", "./assets/weather-icons/conditions/thunderstorm-hail.png", "./assets/weather-icons/conditions/snow.png",
    "./assets/weather-icons/metrics/temperature.png", "./assets/weather-icons/metrics/feels-like.png", "./assets/weather-icons/metrics/temperature-high.png", "./assets/weather-icons/metrics/temperature-low.png", "./assets/weather-icons/metrics/humidity.png", "./assets/weather-icons/metrics/dew-point.png", "./assets/weather-icons/metrics/pressure.png", "./assets/weather-icons/metrics/visibility.png", "./assets/weather-icons/metrics/wind-speed.png", "./assets/weather-icons/metrics/wind-gust.png", "./assets/weather-icons/metrics/wind-direction.png", "./assets/weather-icons/metrics/cloud-cover.png", "./assets/weather-icons/metrics/uv-index.png", "./assets/weather-icons/metrics/air-quality.png", "./assets/weather-icons/metrics/rain-probability.png", "./assets/weather-icons/metrics/rain-volume.png"
  ])));
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

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data?.json?.() || {}; } catch { payload = { body: event.data?.text?.() || "Há uma atualização meteorológica importante." }; }
    const title = String(payload.title || "PLUVIA").slice(0, 120);
    const body = String(payload.body || "Há uma atualização meteorológica importante.").slice(0, 500);
    const severity = Number(payload.severity || 1);
    await self.registration.showNotification(title, {
      body,
      icon: payload.icon || "./icon-192.png",
      badge: payload.badge || "./logo-mark.png",
      tag: String(payload.tag || payload.type || "pluvia").slice(0, 64),
      renotify: severity >= 3,
      requireInteraction: severity >= 4,
      data: { url: payload.url || "./", deliveryId: payload.deliveryId || null, type: payload.type || "weather" },
      actions: [{ action: "open", title: payload.type === "rain_approaching" || payload.type === "heavy_rain" ? "Ver chuva" : "Ver detalhes" }],
    });
    if ("setAppBadge" in self.navigator) await self.navigator.setAppBadge(1).catch(() => {});
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || "./", self.registration.scope);
    if (target.origin !== self.location.origin) target.href = self.registration.scope;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== target.origin) continue;
      if ("navigate" in client) await client.navigate(target.href).catch(() => {});
      return client.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});

self.addEventListener("pushsubscriptionchange", event => {
  event.waitUntil((async () => {
    const options = event.oldSubscription?.options;
    if (!options?.applicationServerKey) return;
    await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey });
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) client.postMessage({ type: "push-subscription-changed" });
  })());
});
