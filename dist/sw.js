const CACHE = "pluvia-panel-118";
const SHELL = "./index.html";
const PRECACHE = [
    "./", SHELL, "./fonts.css?v=type-1", "./assets/fonts/inter-latin-v20.woff2", "./assets/fonts/nunito-wordmark-v32.woff2", "./modules/pwa-gestures.js?v=pwa-1", "./modules/city-time.js?v=time-1", "./sky.css?v=sky-27", "./modules/sky-atmosphere.js?v=sky-16", "./modules/sky-events.js?v=sky-events-1", "./modules/moon-view.js?v=moon-3", "./assets/sky-sun.svg?v=sun-2", "./assets/moon-surface.webp", "./assets/sky-cloud-veil.webp?v=clouds-4", "./assets/sky-cloud-volume.webp?v=clouds-4", "./assets/sky-stars.svg?v=stars-2", "./assets/sky-stars-shimmer.svg?v=stars-2", "./analytics.js?v=analytics-5", "./styles.css?v=core-125", "./redesign.css?v=panel-41", "./continuous.css?v=layout-57", "./capitals.js?v=core-48", "./app.js?v=panel-61", "./p0.js?v=panel-40", "./modules/account-sync.js?v=sync-1", "./modules/social-auth.js?v=oauth-3", "./account.js?v=account-10", "./saved-places.js?v=places-2", "./modules/compare-cities.js?v=compare-2", "./modules/brazil-now.js?v=brazil-1", "./modules/home-layout.js?v=home-layout-1", "./modules/pwa-shortcuts.js?v=shortcuts-1", "./modules/push-style.js?v=push-style-1", "./assets/notifications/rain.png", "./assets/notifications/heavy-rain.png", "./assets/notifications/storm.png", "./assets/notifications/wind.png", "./assets/notifications/heat.png", "./assets/notifications/air.png", "./assets/notifications/change.png", "./assets/notifications/daily.png", "./assets/notifications/alert-2.png", "./assets/notifications/alert-3.png", "./assets/notifications/alert-4.png", "./notifications.js?v=panel-26", "./weather-map.js?v=map-10", "./modules/nowcast.js?v=nowcast-3",
    "./favorite-cities.js?v=favorites-7", "./modules/share-card.js?v=share-card-2", "./modules/share-weather.js?v=share-5", "./modules/hourly-detail.js?v=detail-5", "./modules/daily-detail.js?v=daily-2", "./modules/forecast-spread.js?v=spread-1", "./modules/notification-preferences.js?v=preferences-2", "./modules/sources.js?v=panel-24", "./modules/dialog-motion.js?v=motion-1", "./modules/http-client.js?v=http-1", "./modules/weather-services.js?v=core-115", "./modules/weather-data-layer.js?v=core-115", "./modules/met-merge.js?v=core-111", "./modules/weather-extras.js?v=core-109", "./modules/weather-insights.js?v=core-70", "./modules/radar-probe.js?v=core-70", "./modules/weather-icons.js?v=core-50", "./modules/weather-icon-system.js?v=modern-5", "./modules/risks.js?v=core-118", "./modules/adapters.js?v=core-110", "./vendor/suncalc.js?v=sky-3", "./vendor/suncalc-LICENSE",
    "./assets/rain-near.svg", "./assets/rain-far.svg", "./assets/lightning-near.svg", "./assets/lightning-far.svg", "./manifest.webmanifest", "./logo-mark.png", "./logo-mark.webp", "./logo-pluvia.png", "./favicon-16.png", "./favicon-32.png", "./favicon-96.png", "./apple-touch-icon-180.png", "./icon-192.png", "./icon-512.png", "./icon-splash-192.png", "./icon-splash-512.png", "./icon-maskable-192.png", "./icon-maskable-512.png",
    "./vendor/weathericons/Sun.svg", "./vendor/weathericons/Moon.svg", "./vendor/weathericons/PartlySunny.svg", "./vendor/weathericons/PartlyMoon.svg", "./vendor/weathericons/Cloud.svg", "./vendor/weathericons/Haze.svg", "./vendor/weathericons/Rain.svg", "./vendor/weathericons/Snow.svg", "./vendor/weathericons/Storm.svg", "./vendor/weathericons/Hail.svg",
    "./assets/weather-icons/conditions/clear-day.svg?v=modern-3", "./assets/weather-icons/conditions/clear-night.svg?v=modern-3", "./assets/weather-icons/conditions/few-clouds-day.svg?v=modern-3", "./assets/weather-icons/conditions/few-clouds-night.svg?v=modern-3", "./assets/weather-icons/conditions/partly-cloudy-day.svg?v=modern-3", "./assets/weather-icons/conditions/partly-cloudy-night.svg?v=modern-3", "./assets/weather-icons/conditions/cloudy.svg?v=modern-3", "./assets/weather-icons/conditions/overcast.svg?v=modern-3", "./assets/weather-icons/conditions/drizzle.svg?v=modern-3", "./assets/weather-icons/conditions/light-rain.svg?v=modern-3", "./assets/weather-icons/conditions/moderate-rain.svg?v=modern-3", "./assets/weather-icons/conditions/heavy-rain.svg?v=modern-3", "./assets/weather-icons/conditions/showers.svg?v=modern-3", "./assets/weather-icons/conditions/showers-night.svg?v=modern-3", "./assets/weather-icons/conditions/thunderstorm.svg?v=modern-3", "./assets/weather-icons/conditions/thunderstorm-rain.svg?v=modern-3", "./assets/weather-icons/conditions/thunderstorm-hail.svg?v=modern-3", "./assets/weather-icons/conditions/snow.svg?v=modern-3", "./assets/weather-icons/conditions/sleet.svg?v=modern-3", "./assets/weather-icons/conditions/fog.svg?v=modern-3", "./assets/weather-icons/conditions/haze.svg?v=modern-3", "./assets/weather-icons/conditions/windy.svg?v=modern-3", "./assets/weather-icons/metrics/temperature.svg?v=modern-3", "./assets/weather-icons/metrics/feels-like.svg?v=modern-3", "./assets/weather-icons/metrics/temperature-high.svg?v=modern-3", "./assets/weather-icons/metrics/temperature-low.svg?v=modern-3", "./assets/weather-icons/metrics/humidity.svg?v=modern-3", "./assets/weather-icons/metrics/dew-point.svg?v=modern-3", "./assets/weather-icons/metrics/pressure.svg?v=modern-3", "./assets/weather-icons/metrics/visibility.svg?v=modern-3", "./assets/weather-icons/metrics/wind-speed.svg?v=modern-3", "./assets/weather-icons/metrics/wind-gust.svg?v=modern-3", "./assets/weather-icons/metrics/wind-direction.svg?v=modern-3", "./assets/weather-icons/metrics/cloud-cover.svg?v=modern-3", "./assets/weather-icons/metrics/uv-index.svg?v=modern-3", "./assets/weather-icons/metrics/air-quality.svg?v=modern-3", "./assets/weather-icons/metrics/rain-probability.svg?v=modern-3", "./assets/weather-icons/metrics/rain-volume.svg?v=modern-3", "./assets/weather-icons/astronomy/sunrise.svg?v=modern-3", "./assets/weather-icons/astronomy/sunset.svg?v=modern-3", "./assets/weather-icons/astronomy/daylight.svg?v=modern-3", "./assets/weather-icons/maps/radar.svg?v=modern-3", "./assets/weather-icons/maps/satellite.svg?v=modern-3", "./assets/weather-icons/maps/lightning.svg?v=modern-3", "./assets/weather-icons/fallback/weather-unknown.svg?v=modern-3"
  ];
try { importScripts("./modules/push-style.js?v=push-style-1"); } catch {}
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
    // City pages (/clima/<nome>-<uf>/) are cached under their own URL: storing one as the
    // shell would make the offline Home open that city instead of the visitor's own.
    const key = /^\/clima\/[a-z0-9-]+\/?$/.test(url.pathname) ? req : SHELL;
    respond(fetch(req,{cache:"no-cache"}).then(res => remember(key,res)).catch(() => caches.match(key).then(hit => hit || fallback(SHELL))));
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
    // Ícone, título e botão por condição (modules/push-style.js); sem o módulo, o formato genérico.
    const look = self.PLUVIA?.pushStyle?.style(payload) || { title: "PLUVIA", body: String(payload.body || "Há uma atualização meteorológica importante.").slice(0, 500), icon: "./icon-192.png", action: "Ver detalhes", severity: Number(payload.severity || 1) };
    await self.registration.showNotification(look.title, {
      body: look.body,
      icon: look.icon,
      badge: "./logo-mark.png",
      tag: String(payload.tag || payload.type || "pluvia").slice(0, 64),
      renotify: look.severity >= 3,
      requireInteraction: look.severity >= 4,
      ...(look.vibrate ? { vibrate: look.vibrate } : {}),
      data: { url: payload.url || "./", deliveryId: payload.deliveryId || null, type: payload.type || "weather" },
      actions: [{ action: "open", title: look.action }],
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
