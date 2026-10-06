const CACHE = "pluvia-panel-94";
const SHELL = "./index.html";
const PRECACHE = [
    "./", SHELL, "./fonts.css?v=type-1", "./assets/fonts/inter-latin-v20.woff2", "./assets/fonts/nunito-wordmark-v32.woff2", "./modules/pwa-gestures.js?v=pwa-1", "./modules/city-time.js?v=time-1", "./sky.css?v=sky-23", "./modules/sky-atmosphere.js?v=sky-13", "./modules/moon-view.js?v=moon-3", "./assets/sky-sun.svg?v=sun-2", "./assets/moon-surface.webp", "./assets/sky-cloud-veil.webp?v=clouds-4", "./assets/sky-cloud-volume.webp?v=clouds-4", "./assets/sky-stars.svg", "./assets/sky-stars-shimmer.svg", "./analytics.js?v=analytics-5", "./styles.css?v=core-122", "./redesign.css?v=panel-36", "./continuous.css?v=layout-42", "./capitals.js?v=core-47", "./app.js?v=panel-46", "./p0.js?v=panel-37", "./modules/account-sync.js?v=sync-1", "./modules/social-auth.js?v=oauth-3", "./account.js?v=account-6", "./saved-places.js?v=places-1", "./notifications.js?v=panel-25", "./weather-map.js?v=map-5", "./modules/nowcast.js?v=nowcast-3",
    "./favorite-cities.js?v=favorites-7", "./modules/share-weather.js?v=share-2", "./modules/hourly-detail.js?v=detail-5", "./modules/daily-detail.js?v=daily-2", "./modules/forecast-spread.js?v=spread-1", "./modules/notification-preferences.js?v=preferences-2", "./modules/sources.js?v=panel-23", "./modules/dialog-motion.js?v=motion-1", "./modules/http-client.js?v=http-1", "./modules/weather-services.js?v=core-113", "./modules/weather-data-layer.js?v=core-113", "./modules/met-merge.js?v=core-111", "./modules/weather-extras.js?v=core-109", "./modules/weather-insights.js?v=core-67", "./modules/radar-probe.js?v=core-70", "./modules/weather-icons.js?v=core-49", "./modules/weather-icon-system.js?v=modern-4", "./modules/risks.js?v=core-118", "./modules/adapters.js?v=core-110", "./vendor/suncalc.js?v=sky-3", "./vendor/suncalc-LICENSE",
    "./assets/rain-near.svg", "./assets/rain-far.svg", "./assets/lightning-near.svg", "./assets/lightning-far.svg", "./manifest.webmanifest", "./logo-mark.png", "./logo-pluvia.png", "./favicon-32.png", "./favicon-96.png", "./apple-touch-icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-splash-192.png", "./icon-splash-512.png", "./icon-maskable-192.png", "./icon-maskable-512.png",
    "./vendor/weathericons/Sun.svg", "./vendor/weathericons/Moon.svg", "./vendor/weathericons/PartlySunny.svg", "./vendor/weathericons/PartlyMoon.svg", "./vendor/weathericons/Cloud.svg", "./vendor/weathericons/Haze.svg", "./vendor/weathericons/Rain.svg", "./vendor/weathericons/Snow.svg", "./vendor/weathericons/Storm.svg", "./vendor/weathericons/Hail.svg",
    "./assets/weather-icons/conditions/clear-day.svg?v=modern-3", "./assets/weather-icons/conditions/clear-night.svg?v=modern-3", "./assets/weather-icons/conditions/few-clouds-day.svg?v=modern-3", "./assets/weather-icons/conditions/few-clouds-night.svg?v=modern-3", "./assets/weather-icons/conditions/partly-cloudy-day.svg?v=modern-3", "./assets/weather-icons/conditions/partly-cloudy-night.svg?v=modern-3", "./assets/weather-icons/conditions/cloudy.svg?v=modern-3", "./assets/weather-icons/conditions/overcast.svg?v=modern-3", "./assets/weather-icons/conditions/drizzle.svg?v=modern-3", "./assets/weather-icons/conditions/light-rain.svg?v=modern-3", "./assets/weather-icons/conditions/moderate-rain.svg?v=modern-3", "./assets/weather-icons/conditions/heavy-rain.svg?v=modern-3", "./assets/weather-icons/conditions/showers.svg?v=modern-3", "./assets/weather-icons/conditions/showers-night.svg?v=modern-3", "./assets/weather-icons/conditions/thunderstorm.svg?v=modern-3", "./assets/weather-icons/conditions/thunderstorm-rain.svg?v=modern-3", "./assets/weather-icons/conditions/thunderstorm-hail.svg?v=modern-3", "./assets/weather-icons/conditions/snow.svg?v=modern-3", "./assets/weather-icons/conditions/sleet.svg?v=modern-3", "./assets/weather-icons/conditions/fog.svg?v=modern-3", "./assets/weather-icons/conditions/haze.svg?v=modern-3", "./assets/weather-icons/conditions/windy.svg?v=modern-3", "./assets/weather-icons/metrics/temperature.svg?v=modern-3", "./assets/weather-icons/metrics/feels-like.svg?v=modern-3", "./assets/weather-icons/metrics/temperature-high.svg?v=modern-3", "./assets/weather-icons/metrics/temperature-low.svg?v=modern-3", "./assets/weather-icons/metrics/humidity.svg?v=modern-3", "./assets/weather-icons/metrics/dew-point.svg?v=modern-3", "./assets/weather-icons/metrics/pressure.svg?v=modern-3", "./assets/weather-icons/metrics/visibility.svg?v=modern-3", "./assets/weather-icons/metrics/wind-speed.svg?v=modern-3", "./assets/weather-icons/metrics/wind-gust.svg?v=modern-3", "./assets/weather-icons/metrics/wind-direction.svg?v=modern-3", "./assets/weather-icons/metrics/cloud-cover.svg?v=modern-3", "./assets/weather-icons/metrics/uv-index.svg?v=modern-3", "./assets/weather-icons/metrics/air-quality.svg?v=modern-3", "./assets/weather-icons/metrics/rain-probability.svg?v=modern-3", "./assets/weather-icons/metrics/rain-volume.svg?v=modern-3", "./assets/weather-icons/astronomy/sunrise.svg?v=modern-3", "./assets/weather-icons/astronomy/sunset.svg?v=modern-3", "./assets/weather-icons/astronomy/daylight.svg?v=modern-3", "./assets/weather-icons/maps/radar.svg?v=modern-3", "./assets/weather-icons/maps/satellite.svg?v=modern-3", "./assets/weather-icons/maps/lightning.svg?v=modern-3", "./assets/weather-icons/fallback/weather-unknown.svg?v=modern-3"
  ];
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const critical = url => url === "./" || url === SHELL || /\.(js|css)(\?|$)/.test(url);
    const request = url => new Request(new URL(url, self.location.href), { cache: "reload" });
    await cache.addAll(PRECACHE.filter(critical).map(request));
    // A missing decorative icon must not prevent an otherwise complete update.
    await Promise.allSettled(PRECACHE.filter(url => !critical(url)).map(url => cache.add(request(url))));
    await self.skipWaiting();
  })());
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
  if (url.origin !== location.origin) return; // Never cache external APIs or Auth.
  if (url.pathname.startsWith('/api/')) return; // Local API/dev observations are never shell assets.
  const writes = [];
  function remember(key, response) {
    if (response.ok) {
      const copy = response.clone();
      writes.push(caches.open(CACHE).then(cache => cache.put(key,copy)).catch(() => {}));
    }
    return response;
  }
  function respond(response) {
    event.respondWith(response);
    // Register synchronously. Keep the worker alive through the network read
    // and every cache write, even when the page closes immediately afterward.
    event.waitUntil(response.then(() => Promise.allSettled(writes)).catch(() => {}));
  }
  const fallback = key => caches.match(key).then(hit => hit || Response.error());
  if (req.mode === "navigate") {
    respond(fetch(req,{cache:"no-cache"}).then(res => remember(SHELL,res)).catch(() => fallback(SHELL)));
    return;
  }
  if (url.pathname.endsWith("/municipalities.js") || url.pathname.endsWith("/municipality-index.js") || /\/cities\/[a-z]{2}\.js$/.test(url.pathname)) {
    respond(caches.match(req).then(hit => hit || fetch(req).then(res => remember(req,res))));
    return;
  }
  if (/\.(js|css)$/.test(url.pathname)) {
    respond(fetch(req,{cache:"no-cache"}).then(res => remember(req,res)).catch(() => fallback(req)));
    return;
  }
  respond(caches.match(req).then(hit => hit || fetch(req).then(res => remember(req,res))).catch(() => Response.error()));
});

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data?.json?.() || {}; } catch { payload = { body: event.data?.text?.() || "Há uma atualização meteorológica importante." }; }
    const title = "PLUVIA";
    const eventTitle = String(payload.title || "").replace(/^🔔\s*/, "").trim();
    const detail = String(payload.body || "Há uma atualização meteorológica importante.");
    const origin = payload.type === 'official_alert' ? 'Aviso oficial do INMET' : payload.source && payload.type !== 'test' ? 'Previsão meteorológica' : '';
    const body = [origin, eventTitle && eventTitle !== "PLUVIA" ? `${eventTitle}: ${detail}` : detail].filter(Boolean).join(' · ').slice(0, 500);
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
