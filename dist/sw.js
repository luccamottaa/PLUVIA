const CACHE = "pluvia-panel-368";
const SHELL = "./index.html";
const PRECACHE = [
    "./", SHELL, "./fonts.css?v=type-3", "./assets/fonts/nunito-wordmark-v32.woff2", "./assets/fonts/sora-latin-v1.woff2", "./modules/pwa-gestures.js?v=pwa-1", "./modules/city-time.js?v=time-3", "./sky.css?v=sky-70", "./modules/sky-atmosphere.js?v=sky-26", "./modules/sky-toon.js?v=toon-5", "./modules/compact-header.js?v=compact-6", "./modules/glass-touch.js?v=glass-3", "./modules/glass-segment.js?v=glass-seg-5", "./modules/text-size.js?v=text-size-1", "./modules/sky-events.js?v=sky-events-3", "./modules/sun-table.js?v=sun-table-1", "./modules/eclipses.js?v=eclipses-3", "./modules/moon-view.js?v=moon-8", "./assets/sky-sun.svg?v=sun-3", "./assets/moon-surface.webp?v=moon-1", "./assets/moon-surface-hd.webp?v=moon-hd-1", "./assets/sky-cloud-veil.webp?v=clouds-9", "./assets/sky-stars.svg?v=stars-2", "./analytics.js?v=analytics-25", "./styles.css?v=core-138", "./redesign.css?v=panel-53", "./continuous.css?v=layout-199", "./dialogs.css?v=dialogs-5", "./assets/toon/search-empty.svg?v=toon-art-1", "./capitals.js?v=core-54", "./app.js?v=panel-168", "./p0.js?v=panel-53", "./modules/account-sync.js?v=sync-2", "./modules/social-auth.js?v=oauth-3", "./modules/avatars.js?v=avatars-10", "./modules/terms.js?v=terms-2", "./modules/captcha.js?v=captcha-1", "./account.js?v=account-18", "./saved-places.js?v=places-2", "./modules/brazil-now.js?v=brazil-9", "./modules/brazil-outline.js?v=outline-1", "./modules/brazil-map.js?v=map-1", "./modules/month-recap.js?v=month-2", "./modules/forecast-accuracy.js?v=accuracy-1", "./modules/forecast-sources.js?v=sources-4", "./modules/station-now.js?v=station-6", "./modules/home-layout.js?v=home-layout-11", "./modules/pwa-shortcuts.js?v=shortcuts-4", "./modules/voice-search.js?v=voice-2", "./modules/rain-reports.js?v=rain-reports-3", "./modules/visit-counter.js?v=visits-3", "./modules/changelog.js?v=changelog-398", "./modules/install-prompt.js?v=install-3", "./modules/push-style.js?v=push-style-6", "./assets/notifications/rain.png", "./assets/notifications/heavy-rain.png", "./assets/notifications/storm.png", "./assets/notifications/wind.png", "./assets/notifications/heat.png", "./assets/notifications/air.png", "./assets/notifications/change.png", "./assets/notifications/daily.png", "./assets/notifications/alert-2.png", "./assets/notifications/alert-3.png", "./assets/notifications/alert-4.png", "./notifications.js?v=panel-41", "./weather-map.js?v=map-24",
    "./favorite-cities.js?v=favorites-13", "./modules/hourly-detail.js?v=detail-13", "./modules/daily-detail.js?v=daily-7", "./modules/forecast-spread.js?v=spread-1", "./modules/notification-preferences.js?v=preferences-3", "./modules/sources.js?v=panel-26", "./modules/dialog-motion.js?v=motion-4", "./modules/http-client.js?v=http-4", "./modules/weather-services.js?v=core-119", "./modules/weather-data-layer.js?v=core-117", "./modules/met-merge.js?v=core-112", "./modules/weather-extras.js?v=core-109", "./modules/weather-insights.js?v=core-81", "./modules/radar-probe.js?v=core-73", "./modules/radar-nowcast.js?v=nowcast-6", "./modules/observed-rain.js?v=observed-rain-6", "./modules/weather-icons.js?v=core-51", "./modules/weather-icon-system.js?v=modern-17", "./modules/risks.js?v=core-120", "./modules/adapters.js?v=core-110", "./vendor/suncalc.js?v=sky-4", "./vendor/suncalc-LICENSE",
    "./manifest.webmanifest", "./logo-mark.png?v=logo-5", "./logo-mark.webp?v=logo-5", "./logo-pluvia.png?v=logo-5", "./favicon-16.png?v=logo-5", "./favicon-32.png?v=logo-5", "./favicon-96.png?v=logo-5", "./icon-192.png?v=logo-5", "./icon-512.png?v=logo-5", "./icon-splash-192.png?v=logo-5", "./icon-splash-512.png?v=logo-5", "./icon-maskable-192.png?v=logo-5", "./icon-maskable-512.png?v=logo-5",
    "./vendor/weathericons/Sun.svg", "./vendor/weathericons/Moon.svg", "./vendor/weathericons/PartlySunny.svg", "./vendor/weathericons/PartlyMoon.svg", "./vendor/weathericons/Cloud.svg", "./vendor/weathericons/Haze.svg", "./vendor/weathericons/Rain.svg", "./vendor/weathericons/Snow.svg", "./vendor/weathericons/Storm.svg", "./vendor/weathericons/Hail.svg",
    "./assets/weather-icons/conditions/clear-day.svg?v=modern-8", "./assets/weather-icons/conditions/clear-night.svg?v=modern-8", "./assets/weather-icons/conditions/few-clouds-day.svg?v=modern-8", "./assets/weather-icons/conditions/few-clouds-night.svg?v=modern-8", "./assets/weather-icons/conditions/partly-cloudy-day.svg?v=modern-8", "./assets/weather-icons/conditions/partly-cloudy-night.svg?v=modern-8", "./assets/weather-icons/conditions/cloudy.svg?v=modern-8", "./assets/weather-icons/conditions/overcast.svg?v=modern-8", "./assets/weather-icons/conditions/drizzle.svg?v=modern-8", "./assets/weather-icons/conditions/light-rain.svg?v=modern-8", "./assets/weather-icons/conditions/moderate-rain.svg?v=modern-8", "./assets/weather-icons/conditions/heavy-rain.svg?v=modern-8", "./assets/weather-icons/conditions/showers.svg?v=modern-8", "./assets/weather-icons/conditions/showers-night.svg?v=modern-8", "./assets/weather-icons/conditions/thunderstorm.svg?v=modern-8", "./assets/weather-icons/conditions/thunderstorm-rain.svg?v=modern-8", "./assets/weather-icons/conditions/thunderstorm-hail.svg?v=modern-8", "./assets/weather-icons/conditions/snow.svg?v=modern-8", "./assets/weather-icons/conditions/sleet.svg?v=modern-8", "./assets/weather-icons/conditions/fog.svg?v=modern-8", "./assets/weather-icons/conditions/haze.svg?v=modern-8", "./assets/weather-icons/conditions/windy.svg?v=modern-8", "./assets/weather-icons/metrics/temperature.svg?v=modern-8", "./assets/weather-icons/metrics/feels-like.svg?v=modern-8", "./assets/weather-icons/metrics/temperature-high.svg?v=modern-8", "./assets/weather-icons/metrics/temperature-low.svg?v=modern-8", "./assets/weather-icons/metrics/humidity.svg?v=modern-8", "./assets/weather-icons/metrics/dew-point.svg?v=modern-8", "./assets/weather-icons/metrics/pressure.svg?v=modern-8", "./assets/weather-icons/metrics/visibility.svg?v=modern-8", "./assets/weather-icons/metrics/wind-speed.svg?v=modern-8", "./assets/weather-icons/metrics/wind-gust.svg?v=modern-8", "./assets/weather-icons/metrics/wind-direction.svg?v=modern-8", "./assets/weather-icons/metrics/cloud-cover.svg?v=modern-8", "./assets/weather-icons/metrics/uv-index.svg?v=modern-8", "./assets/weather-icons/metrics/air-quality.svg?v=modern-8", "./assets/weather-icons/metrics/rain-probability.svg?v=modern-8", "./assets/weather-icons/metrics/rain-volume.svg?v=modern-8", "./assets/weather-icons/astronomy/sunrise.svg?v=modern-8", "./assets/weather-icons/astronomy/sunset.svg?v=modern-8", "./assets/weather-icons/astronomy/daylight.svg?v=modern-8", "./assets/weather-icons/maps/radar.svg?v=modern-8", "./assets/weather-icons/maps/satellite.svg?v=modern-8", "./assets/weather-icons/maps/lightning.svg?v=modern-8", "./assets/weather-icons/fallback/weather-unknown.svg?v=modern-8"
  ];
try { importScripts("./modules/push-style.js?v=push-style-6"); } catch {}
// Resposta que chegou por redirecionamento vira uma resposta comum com o mesmo corpo e cabeçalhos.
async function unwrap(response) {
  if (!response.redirected) return response;
  return new Response(await response.blob(), {status: response.status, statusText: response.statusText, headers: response.headers});
}
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const critical = url => url === "./" || url === SHELL || /\.(js|css)(\?|$)/.test(url);
    // Arquivo com ?v= não pode estar velho (a URL muda junto com o conteúdo): vem do cache HTTP que a própria
    // página acabou de encher. Antes tudo era baixado de novo, ~0,5 MB a mais na primeira visita (1.25).
    // Sem versão (shell, manifest, ícones) continua indo à rede.
    const request = url => new Request(new URL(url, self.location.href), /[?&]v=/.test(url) ? {} : { cache: "reload" });
    // O Cloudflare Pages responde /index.html com 308 para "/": a resposta guardada viria "redirecionada", e o
    // Safari recusa uma navegação servida pelo SW com redirecionamento (offline não abriria). O shell é
    // buscado à parte e guardado limpo; os demais continuam no addAll.
    const shell = await fetch(request(SHELL));
    if (!shell.ok) throw new Error("shell");
    await cache.put(new URL(SHELL, self.location.href).href, await unwrap(shell));
    await cache.addAll(PRECACHE.filter(url => critical(url) && url !== SHELL).map(request));
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
  if (url.pathname.startsWith('/api/')) return; // Local API/dev endpoints are never shell assets.
  // Ícone da Tela de Início: o iPhone busca na hora de "Adicionar" e mostrava só a letra "P" (1.18.1); vai direto
  // para a rede, sem passar pelo cache do SW.
  if (url.pathname.endsWith('/apple-touch-icon-180.png')) return;
  const writes = [];
  function remember(key, response) {
    if (response.ok) {
      const copy = response.clone();
      writes.push(Promise.all([caches.open(CACHE), unwrap(copy)]).then(([cache, clean]) => cache.put(key,clean)).catch(() => {}));
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
    // City pages (/clima/<nome>-<uf>/) and the legal pages (/termos/, /privacidade/) are cached under their own
    // URL: storing one as the shell would make the offline Home open that page instead.
    const key = /^\/(?:clima\/[a-z0-9-]+|termos|privacidade)\/?$/.test(url.pathname) ? req : SHELL;
    respond(fetch(req,{cache:"no-cache"}).then(res => remember(key,res)).catch(() => caches.match(key).then(hit => hit || fallback(SHELL))));
    return;
  }
  if (url.pathname.endsWith("/municipalities.js") || url.pathname.endsWith("/municipality-index.js") || /\/cities\/[a-z]{2}\.js$/.test(url.pathname)) {
    respond(caches.match(req).then(hit => hit || fetch(req).then(res => remember(req,res))));
    return;
  }
  if (/\.(js|css)$/.test(url.pathname) && url.searchParams.has("v")) {
    // Versioned files (?v=) never change under the same URL, and every content change also bumps
    // CACHE: serve them from the cache first. Network-first revalidated ~60 scripts and sheets on
    // every open (GitHub Pages only allows a 10-minute TTL), so a weak connection held the app
    // until each 304 came back.
    respond(caches.match(req).then(hit => hit || fetch(req).then(res => remember(req,res))).catch(() => Response.error()));
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
      badge: "./logo-mark.png?v=logo-5",
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
      // Sem navigate (ou com falha), a página já aberta recebe o endereço para registrar a abertura e ir à seção.
      const navigated = "navigate" in client ? await client.navigate(target.href).then(() => true, () => false) : false;
      if (!navigated) client.postMessage({ type: "push-opened", url: target.href });
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
