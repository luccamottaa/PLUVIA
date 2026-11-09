(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.weatherIcons = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** @typedef {'clear-day'|'clear-night'|'few-clouds-day'|'few-clouds-night'|'partly-cloudy-day'|'partly-cloudy-night'|'cloudy'|'overcast'|'light-rain'|'moderate-rain'|'heavy-rain'|'showers'|'showers-night'|'thunderstorm'|'thunderstorm-rain'|'thunderstorm-hail'|'snow'|'sleet'|'hail'|'fog'|'mist'|'haze'|'smoke'|'dust'|'sand'|'windy'|'windy-cloudy'|'tropical-storm'|'cyclone'} WeatherConditionIcon */
  /** @typedef {'temperature'|'feels-like'|'temperature-high'|'temperature-low'|'humidity'|'dew-point'|'pressure'|'wind-speed'|'wind-gust'|'wind-direction'|'visibility'|'cloud-cover'|'uv-index'|'air-quality'|'rain-probability'|'rain-volume'|'precipitation'|'snow-probability'|'snow-accumulation'} WeatherMetricIcon */
  /** @typedef {'sunrise'|'sunset'|'daylight'|'clear-night'|'starry-night'|'moon-new'|'moon-waxing-crescent'|'moon-first-quarter'|'moon-waxing-gibbous'|'moon-full'|'moon-waning-gibbous'|'moon-last-quarter'|'moon-waning-crescent'} AstronomyIcon */
  /** @typedef {'radar'|'satellite'|'clouds'|'precipitation'|'map-rain'|'map-temperature'|'map-feels-like'|'map-wind'|'map-pressure'|'map-humidity'|'map-air-quality'|'map-visibility'|'map-uv'|'waves'|'sea-temperature'|'cyclone'|'wildfire'|'lightning'} WeatherMapIcon */
  /** @typedef {'alert-general'|'alert-rain'|'alert-heavy-rain'|'alert-thunderstorm'|'alert-lightning'|'alert-hail'|'alert-wind'|'alert-heat'|'alert-extreme-heat'|'alert-cold'|'alert-extreme-cold'|'alert-fog'|'alert-flood'|'alert-cyclone'|'alert-wildfire'} WeatherAlertIcon */
  /** @typedef {'updated'|'stale-data'|'offline'|'unavailable'|'unknown'} WeatherStatusIcon */
  /** @typedef {'weather-unknown'|'metric-unknown'|'map-unknown'|'alert-unknown'|'not-available'} WeatherFallbackIcon */

  const BASE = "/assets/weather-icons/";
  const LEGACY_BASE = "/vendor/weathericons/";
  const CONDITIONS = Object.freeze({
    0: ["clear", "Céu limpo"], 1: ["mostly-clear", "Predomínio de céu limpo"], 2: ["partly-cloudy", "Parcialmente nublado"], 3: ["overcast", "Nublado"],
    45: ["fog", "Neblina"], 48: ["fog", "Neblina com depósito"],
    51: ["drizzle", "Garoa fraca"], 53: ["drizzle", "Garoa"], 55: ["drizzle", "Garoa intensa"], 56: ["freezing-drizzle", "Garoa congelante fraca"], 57: ["freezing-drizzle", "Garoa congelante intensa"],
    61: ["light-rain", "Chuva fraca"], 63: ["rain", "Chuva moderada"], 65: ["heavy-rain", "Chuva forte"], 66: ["freezing-rain", "Chuva congelante fraca"], 67: ["freezing-rain", "Chuva congelante forte"],
    71: ["light-snow", "Neve fraca"], 73: ["snow", "Neve moderada"], 75: ["heavy-snow", "Neve forte"], 77: ["snow-grains", "Grãos de neve"],
    80: ["light-showers", "Pancadas fracas"], 81: ["showers", "Pancadas de chuva"], 82: ["heavy-showers", "Pancadas fortes"], 85: ["snow-showers", "Pancadas de neve"], 86: ["heavy-snow-showers", "Pancadas fortes de neve"],
    95: ["storm", "Trovoadas"], 96: ["hail-storm", "Trovoadas com granizo"], 99: ["hail-storm", "Trovoadas fortes com granizo"]
  });
  const ASSETS = Object.freeze({
  "conditions": {
    "clear-day": "clear-day.svg",
    "clear-night": "clear-night.svg",
    "few-clouds-day": "few-clouds-day.svg",
    "few-clouds-night": "few-clouds-night.svg",
    "partly-cloudy-day": "partly-cloudy-day.svg",
    "partly-cloudy-night": "partly-cloudy-night.svg",
    "cloudy": "cloudy.svg",
    "overcast": "overcast.svg",
    "drizzle": "drizzle.svg",
    "light-rain": "light-rain.svg",
    "moderate-rain": "moderate-rain.svg",
    "heavy-rain": "heavy-rain.svg",
    "showers": "showers.svg",
    "showers-night": "showers-night.svg",
    "thunderstorm": "thunderstorm.svg",
    "thunderstorm-rain": "thunderstorm-rain.svg",
    "thunderstorm-hail": "thunderstorm-hail.svg",
    "snow": "snow.svg",
    "sleet": "sleet.svg",
    "fog": "fog.svg",
    "haze": "haze.svg",
    "windy": "windy.svg"
  },
  "metrics": {
    "temperature": "temperature.svg",
    "feels-like": "feels-like.svg",
    "temperature-high": "temperature-high.svg",
    "temperature-low": "temperature-low.svg",
    "humidity": "humidity.svg",
    "dew-point": "dew-point.svg",
    "pressure": "pressure.svg",
    "visibility": "visibility.svg",
    "wind-speed": "wind-speed.svg",
    "wind-gust": "wind-gust.svg",
    "wind-direction": "wind-direction.svg",
    "cloud-cover": "cloud-cover.svg",
    "uv-index": "uv-index.svg",
    "air-quality": "air-quality.svg",
    "rain-probability": "rain-probability.svg",
    "rain-volume": "rain-volume.svg"
  },
  "astronomy": {
    "sunrise": "sunrise.svg",
    "sunset": "sunset.svg",
    "daylight": "daylight.svg"
  },
  "maps": {
    "radar": "radar.svg",
    "satellite": "satellite.svg",
    "lightning": "lightning.svg"
  },
  "fallback": {
    "weather-unknown": "weather-unknown.svg"
  }
});
  const ASSET_ALIASES = Object.freeze({"clouds":"cloudy","precipitation":"moderate-rain","map-rain":"moderate-rain","map-temperature":"temperature","map-feels-like":"feels-like","map-wind":"wind-speed","map-pressure":"pressure","map-humidity":"humidity","map-air-quality":"air-quality","map-visibility":"visibility","map-uv":"uv-index","starry-night":"clear-night"});
  const LABELS = Object.freeze({
    temperature:"Temperatura", "feels-like":"Sensação térmica", "temperature-high":"Temperatura máxima", "temperature-low":"Temperatura mínima", humidity:"Umidade",
    "dew-point":"Ponto de orvalho", pressure:"Pressão atmosférica", visibility:"Visibilidade", "wind-speed":"Velocidade do vento", "wind-gust":"Rajadas de vento",
    "wind-direction":"Direção do vento", "cloud-cover":"Cobertura de nuvens", "uv-index":"Índice UV", "air-quality":"Qualidade do ar", "rain-probability":"Probabilidade de chuva",
    "rain-volume":"Volume de chuva", sunrise:"Nascer do sol", sunset:"Pôr do sol", daylight:"Duração do dia", "weather-unknown":"Condição meteorológica desconhecida"
  });
  const LEGACY_FALLBACKS = Object.freeze({
    "few-clouds-day":"PartlySunny.svg", "few-clouds-night":"PartlyMoon.svg", mist:"Haze.svg", smoke:"Haze.svg", dust:"Haze.svg", sand:"Haze.svg", sleet:"Snow.svg", hail:"Hail.svg",
    windy:"Cloud.svg", "windy-cloudy":"Cloud.svg", "tropical-storm":"Storm.svg", cyclone:"Storm.svg", sunrise:"Sunrise.svg", sunset:"Sun.svg", daylight:"Sun.svg", "starry-night":"Moon.svg",
    "moon-new":"Moon.svg", "moon-waxing-crescent":"Moon.svg", "moon-first-quarter":"Moon.svg", "moon-waxing-gibbous":"Moon.svg", "moon-full":"Moon.svg",
    "moon-waning-gibbous":"Moon.svg", "moon-last-quarter":"Moon.svg", "moon-waning-crescent":"Moon.svg", "weather-unknown":"Cloud.svg", "metric-unknown":"Cloud.svg",
    "map-unknown":"Cloud.svg", "alert-unknown":"Storm.svg", "not-available":"Cloud.svg"
  });

  function condition(code) { const value = CONDITIONS[Number(code)] || ["variable", "Tempo variável"]; return { key:value[0], label:value[1] }; }
  function conditionIconName(code, isDay = true) {
    const key = condition(code).key;
    if (key === "clear") return isDay ? "clear-day" : "clear-night";
    if (key === "mostly-clear") return isDay ? "few-clouds-day" : "few-clouds-night";
    if (key === "partly-cloudy") return isDay ? "partly-cloudy-day" : "partly-cloudy-night";
    if (key === "overcast") return "overcast";
    if (key === "fog") return "fog";
    if (key === "drizzle") return "drizzle";
    if (["freezing-drizzle","freezing-rain"].includes(key)) return "sleet";
    if (key === "light-rain") return "light-rain";
    if (["rain","freezing-rain"].includes(key)) return "moderate-rain";
    if (key === "heavy-rain") return "heavy-rain";
    if (key.includes("showers") && key.includes("snow")) return "snow";
    if (key.includes("showers")) return key === "heavy-showers" ? "heavy-rain" : isDay ? "showers" : "showers-night";
    if (key.includes("snow")) return "snow";
    if (key === "hail-storm") return "thunderstorm-hail";
    if (key === "storm") return "thunderstorm";
    return "weather-unknown";
  }
  function findAsset(name) {
    const resolvedName = ASSET_ALIASES[name] || name;
    for (const [category, entries] of Object.entries(ASSETS)) if (entries[resolvedName]) {
      const version = "?v=modern-8";
      return { name, resolvedName, category, file:entries[resolvedName], src:`${BASE}${category}/${entries[resolvedName]}${version}`, source:"pluvia-vector" };
    }
    return { name, category:"fallback", file:"weather-unknown.svg", src:`${BASE}fallback/weather-unknown.svg?v=modern-8`, source:"pluvia-vector" };
  }
  function assetFor(code, isDay = true) { return findAsset(conditionIconName(code, isDay)).file; }
  function icon(code, isDay = true, options = {}) { const info=condition(code); return { ...info, ...findAsset(conditionIconName(code,isDay)), isDay:Boolean(isDay), label:options.label || info.label }; }
  function namedIcon(name, options = {}) { const safeName=String(name || "weather-unknown").toLowerCase(); return { ...findAsset(safeName), label:options.label || LABELS[safeName] || "Informação meteorológica" }; }
  function imageMarkup(item, options = {}) {
    const className=String(options.className || "weather-icon").replace(/[^a-zA-Z0-9 _-]/g, "");
    const label=String(item.label).replace(/[&<>\"]/g, value => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[value]);
    const accessibility=options.decorative === false ? `alt="${label}"` : 'alt="" aria-hidden="true"';
    const size=Math.max(16,Math.min(256,Number(options.size)||256)); const eager=Boolean(options.eager || options.priority);
    return `<img class="${className}" src="${item.src}" ${accessibility} data-weather-icon="${item.name}" data-icon-source="${item.source}" width="${size}" height="${size}" loading="${eager ? "eager" : "lazy"}"${options.priority ? ' fetchpriority="high"' : ""} decoding="async">`;
  }
  // Condições em traço (1.63, Home no visual do protótipo, pedido do dono): grade de 24 px, traço na cor do texto
  // (currentColor), com o sol em amarelo e a chuva em azul (.wl-sun/.wl-rain, cores no CSS). Mesmo mapeamento WMO
  // de conditionIconName; as ilustrações chapadas (assets/weather-icons) continuam para notificações, story e QA.
  const LINE_CLOUD = 'M7 18h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 9.2 4.4 4.4 0 0 0 7 18Z';
  const LINE_SUN = '<g class="wl-sun"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></g>';
  const lineCloud = (dy = 0) => `<path d="${LINE_CLOUD}"${dy ? ` transform="translate(0 ${dy})"` : ""}/>`;
  const smallSun = '<path class="wl-sun" d="M8.5 6.2a3.6 3.6 0 0 1 5.6 2.4M8.5 2.5v1.2M3.8 8.4H5M4.9 4.8l.9.9"/>';
  const smallMoon = '<path class="wl-moon" d="M12.6 6.9A4.3 4.3 0 0 1 7 3a4.3 4.3 0 1 0 1.7 6.3"/>';
  const LINE_CONDITIONS = Object.freeze({
    "clear-day": LINE_SUN,
    "clear-night": '<path class="wl-moon" d="M19.5 14.6A7.5 7.5 0 0 1 9.4 4.5a7.5 7.5 0 1 0 10.1 10.1Z"/>',
    "few-clouds-day": smallSun + '<path d="M9 19h7a3 3 0 0 0 .5-5.96A4 4 0 0 0 9.1 12.5 3.2 3.2 0 0 0 9 19Z"/>',
    "few-clouds-night": smallMoon + '<path d="M9 19h7a3 3 0 0 0 .5-5.96A4 4 0 0 0 9.1 12.5 3.2 3.2 0 0 0 9 19Z"/>',
    "partly-cloudy-day": smallSun + `<path d="${LINE_CLOUD}" transform="translate(1 1)"/>`,
    "partly-cloudy-night": smallMoon + `<path d="${LINE_CLOUD}" transform="translate(1 1)"/>`,
    "overcast": '<path d="M9.5 7.2A4.5 4.5 0 0 1 17.6 8"/>' + lineCloud(1),
    "fog": lineCloud(-4) + '<path d="M4 17.5h16M6 20.5h12"/>',
    "drizzle": lineCloud(-3) + '<path class="wl-rain" d="M9 18.5v.8M13 18.5v.8M11 20.8v.7M15 20.8v.7"/>',
    "light-rain": lineCloud(-3) + '<path class="wl-rain" d="M10 18.5 9.1 21M14.5 18.5l-.9 2.5"/>',
    "moderate-rain": lineCloud(-3) + '<path class="wl-rain" d="M8.5 18.5 7.6 21M12.5 18.5l-.9 2.5M16.5 18.5l-.9 2.5"/>',
    "showers": smallSun + lineCloud(-2) + '<path class="wl-rain" d="M10 19.5 9.3 21.5M14 19.5l-.7 2"/>',
    "showers-night": smallMoon + lineCloud(-2) + '<path class="wl-rain" d="M10 19.5 9.3 21.5M14 19.5l-.7 2"/>',
    "heavy-rain": lineCloud(-3) + '<path class="wl-rain wl-heavy" d="M7.5 18.3 6.3 21.6M11.5 18.3l-1.2 3.3M15.5 18.3l-1.2 3.3M18.6 18.3l-.8 2.1"/>',
    "sleet": lineCloud(-3) + '<path class="wl-rain" d="M9 18.5 8.1 21M15 18.5l-.9 2.5"/><path class="wl-dot" d="M12 20h.01"/>',
    "snow": lineCloud(-3) + '<path class="wl-dot" d="M8 19h.01M12 21h.01M16 19h.01M10 21.5h.01M14 18.5h.01"/>',
    "thunderstorm": lineCloud(-3) + '<path class="wl-bolt" d="m12.8 15.6-2.3 3.4h3l-2.2 3.4"/>',
    "thunderstorm-hail": lineCloud(-3) + '<path class="wl-bolt" d="m11.8 15.6-2.3 3.4h3l-2.2 3.4"/><path class="wl-dot" d="M16 18.5h.01M17 21h.01"/>',
    "weather-unknown": lineCloud(),
  });
  function lineCondition(code, isDay = true, options = {}) {
    const item = icon(code, isDay, options), name = conditionIconName(code, isDay);
    const body = LINE_CONDITIONS[name] || LINE_CONDITIONS["weather-unknown"];
    const className = String(options.className || "weather-icon").replace(/[^a-zA-Z0-9 _-]/g, "");
    const label = String(item.label).replace(/[&<>"]/g, value => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[value]);
    const accessibility = options.decorative === false ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
    return `<svg class="${className} weather-line-icon" viewBox="0 0 24 24" ${accessibility} focusable="false" data-weather-icon="${name}" data-icon-style="line">${body}</svg>`;
  }
  // markup() desenha em traço por padrão; {style:"image"} devolve a ilustração chapada.
  function markup(code,isDay=true,options={}) { return options.style === "image" ? imageMarkup(icon(code,isDay,options),options) : lineCondition(code,isDay,options); }
  function markupName(name,options={}) { return imageMarkup(namedIcon(name,options),options); }
  function hydrate(scope) {
    const root = scope && typeof scope.querySelectorAll === "function" ? scope : null;
    root?.querySelectorAll("[data-weather-icon-name]").forEach(node => {
      const name = node.getAttribute("data-weather-icon-name") || "weather-unknown";
      if (node.getAttribute("data-weather-icon-style") === "line" && LINE_METRICS[name]) { node.innerHTML = lineMarkup(name); return; }
      const label = node.getAttribute("data-weather-icon-alt") || LABELS[name];
      node.innerHTML = markupName(name, { className:"metric-weather-icon", label, decorative:node.getAttribute("data-weather-icon-informative") !== "true", size:48 });
    });
  }
  // Line glyphs for the Home reading tiles, drawn in the same stroke family as the
  // section icons (clock, calendar, alert): 24px grid, currentColor, round joins.
  // The colourful metric assets stay available for every other consumer.
  const THERMOMETER = '<path d="M7.5 13.6V5.5a2 2 0 0 1 4 0v8.1a4 4 0 1 1-4 0Z"/><path d="M9.5 17V9"/>';
  const LINE_METRICS = Object.freeze({
    "temperature": THERMOMETER,
    "feels-like": THERMOMETER + '<path d="M15.5 5.5c1.2 1 1.2 2 0 3s-1.2 2 0 3m4-6c1.2 1 1.2 2 0 3s-1.2 2 0 3"/>',
    "temperature-high": THERMOMETER + '<path d="M18 11V3.5m-3 3 3-3 3 3"/>',
    "temperature-low": THERMOMETER + '<path d="M18 3.5V11m-3-3 3 3 3-3"/>',
    "visibility": '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    "humidity": '<path d="M12 3.2s-6 6.4-6 10.8a6 6 0 0 0 12 0c0-4.4-6-10.8-6-10.8Z"/><path d="M9.3 14.6a2.8 2.8 0 0 0 2.4 2.6"/>',
    "wind-speed": '<path d="M3 8h9.5a2.5 2.5 0 1 0-2.4-3.1M3 12h15.5a2.5 2.5 0 1 1-2.4 3.1M3 16h7"/>',
    "pressure": '<path d="M4.2 18.5a9 9 0 1 1 15.6 0"/><path d="m12 14 3.8-4.3"/><circle cx="12" cy="14" r="1"/>',
    "rain-chance": '<path d="M3 12.5a9 9 0 0 1 18 0Z"/><path d="M12 12.5v6a2 2 0 0 1-4 0"/><path d="M12 3.5v-1"/>',
    "uv-index": '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2m0 15v2M4.6 4.6 6 6m12 12 1.4 1.4M2.5 12h2m15 0h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    "air-quality": '<path d="M5 19c-.6-6.6 4.4-13 15-14 .8 9.8-5 15.6-12.2 14.4"/><path d="M4 20c3.2-4.4 6.6-7.4 10.5-9.6"/>',
    "river": '<path d="M3 8.5c2.2 0 2.2-1.5 4.5-1.5S9.8 8.5 12 8.5 14.2 7 16.5 7 18.8 8.5 21 8.5"/><path d="M3 13c2.2 0 2.2-1.5 4.5-1.5S9.8 13 12 13s2.2-1.5 4.5-1.5S18.8 13 21 13"/><path d="M3 17.5c2.2 0 2.2-1.5 4.5-1.5s2.3 1.5 4.5 1.5 2.2-1.5 4.5-1.5 2.3 1.5 4.5 1.5"/>',
    // Títulos de seção (1.37.2, pedido do dono): radar (nuvem com chuva) e ciclo do dia (Sol nascendo no horizonte).
    "radar": '<path d="M7 15h9.5a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 6.6 8.8 3.1 3.1 0 0 0 7 15Z"/><path d="m8.5 18-1 2.5m5-2.5-1 2.5m5-2.5-1 2.5"/>',
    "sun-cycle": '<path d="M3 18h18M7 21h10"/><path d="M7.5 18a4.5 4.5 0 0 1 9 0"/><path d="M12 7v3M5.6 10.6l1.6 1.6m11.2-1.6-1.6 1.6"/>',
    "fire": '<path d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-4.2-3.3-6.6-4.5-10.5-2.1 1.6-3 3.8-3 6-1.1-.6-1.8-1.7-2-3-1.7 1.7-3.5 4-3.5 7.5A6.5 6.5 0 0 0 12 21Z"/><path d="M12 21a2.8 2.8 0 0 1-2.8-2.8c0-1.9 1.6-2.8 2.8-4.7 1.2 1.9 2.8 2.8 2.8 4.7A2.8 2.8 0 0 1 12 21Z"/>'
  });
  function lineMarkup(name) {
    const body = LINE_METRICS[String(name || "").toLowerCase()];
    return body ? `<svg class="metric-line-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>` : "";
  }
  function isDayAt(iso,sunrise,sunset) { const value=Date.parse(iso), rise=Date.parse(sunrise), set=Date.parse(sunset); return Number.isFinite(value)&&Number.isFinite(rise)&&Number.isFinite(set) ? value>=rise&&value<set : true; }
  return { ASSETS, ASSET_ALIASES, CONDITIONS, LABELS, LINE_METRICS, LINE_CONDITIONS, lineMarkup, lineCondition, condition, conditionIconName, assetFor, findAsset, icon, namedIcon, markup, markupName, hydrate, isDayAt };
});
