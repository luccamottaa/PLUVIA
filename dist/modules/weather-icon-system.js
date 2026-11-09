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
  // linha:inicio (gerado por scripts/generate-line-icons.py; não editar à mão)
  const LINE_CONDITIONS = Object.freeze({
    "clear-day": '<path class="wl-sun" d="M16.2 12L16.19 12.29L16.16 12.58L16.11 12.87L16.04 13.16L15.95 13.44L15.84 13.71L15.71 13.97L15.56 14.23L15.4 14.47L15.22 14.7L15.02 14.92L14.81 15.12L14.59 15.31L14.35 15.48L14.1 15.64L13.84 15.77L13.57 15.89L13.3 15.99L13.02 16.08L12.73 16.14L12.44 16.18L12.15 16.2L11.85 16.2L11.56 16.18L11.27 16.14L10.98 16.08L10.7 15.99L10.43 15.89L10.16 15.77L9.9 15.64L9.65 15.48L9.41 15.31L9.19 15.12L8.98 14.92L8.78 14.7L8.6 14.47L8.44 14.23L8.29 13.97L8.16 13.71L8.05 13.44L7.96 13.16L7.89 12.87L7.84 12.58L7.81 12.29L7.8 12L7.81 11.71L7.84 11.42L7.89 11.13L7.96 10.84L8.05 10.56L8.16 10.29L8.29 10.03L8.44 9.77L8.6 9.53L8.78 9.3L8.98 9.08L9.19 8.88L9.41 8.69L9.65 8.52L9.9 8.36L10.16 8.23L10.43 8.11L10.7 8.01L10.98 7.92L11.27 7.86L11.56 7.82L11.85 7.8L12.15 7.8L12.44 7.82L12.73 7.86L13.02 7.92L13.3 8.01L13.57 8.11L13.84 8.23L14.1 8.36L14.35 8.52L14.59 8.69L14.81 8.88L15.02 9.08L15.22 9.3L15.4 9.53L15.56 9.77L15.71 10.03L15.84 10.29L15.95 10.56L16.04 10.84L16.11 11.13L16.16 11.42L16.19 11.71L16.2 12"/><path class="wl-sun" d="M18.1 12L19.8 12M16.31 16.31L17.52 17.52M12 18.1L12 19.8M7.69 16.31L6.48 17.52M5.9 12L4.2 12M7.69 7.69L6.48 6.48M12 5.9L12 4.2M16.31 7.69L17.52 6.48"/>',
    "clear-night": '<path class="wl-moon" d="M18.39 14.85L18.24 15.18L18.06 15.5L17.87 15.81L17.66 16.11L17.44 16.41L17.2 16.68L16.95 16.95L16.68 17.2L16.41 17.44L16.11 17.66L15.81 17.87L15.5 18.06L15.18 18.24L14.85 18.39L14.51 18.54L14.16 18.66L13.81 18.76L13.46 18.85L13.1 18.91L12.73 18.96L12.37 18.99L12 19L11.63 18.99L11.27 18.96L10.9 18.91L10.54 18.85L10.19 18.76L9.84 18.66L9.49 18.54L9.15 18.39L8.82 18.24L8.5 18.06L8.19 17.87L7.89 17.66L7.59 17.44L7.32 17.2L7.05 16.95L6.8 16.68L6.56 16.41L6.34 16.11L6.13 15.81L5.94 15.5L5.76 15.18L5.61 14.85L5.46 14.51L5.34 14.16L5.24 13.81L5.15 13.46L5.09 13.1L5.04 12.73L5.01 12.37L5 12L5.01 11.63L5.04 11.27L5.09 10.9L5.15 10.54L5.24 10.19L5.34 9.84L5.46 9.49L5.61 9.15L5.76 8.82L5.94 8.5L6.13 8.19L6.34 7.89L6.56 7.59L6.8 7.32L7.05 7.05L7.32 6.8L7.59 6.56L7.89 6.34L8.19 6.13L8.5 5.94L8.82 5.76L9.15 5.61L9.49 5.46L9.84 5.34L10.19 5.24L10.54 5.15L10.75 5.15L10.57 5.42L10.39 5.7L10.24 5.99L10.09 6.29L9.97 6.59L9.86 6.9L9.76 7.22L9.69 7.54L9.63 7.86L9.58 8.19L9.56 8.52L9.55 8.85L9.56 9.18L9.58 9.51L9.63 9.84L9.69 10.16L9.76 10.48L9.86 10.8L9.97 11.11L10.09 11.41L10.24 11.71L10.39 12L10.57 12.28L10.75 12.55L10.95 12.81L11.17 13.07L11.4 13.3L11.63 13.53L11.89 13.75L12.15 13.95L12.42 14.13L12.7 14.31L12.99 14.46L13.29 14.61L13.59 14.73L13.9 14.84L14.22 14.94L14.54 15.01L14.86 15.07L15.19 15.12L15.52 15.14L15.85 15.15L16.18 15.14L16.51 15.12L16.84 15.07L17.16 15.01L17.48 14.94L17.8 14.84L18.11 14.73L18.41 14.61L18.39 14.85"/>',
    "few-clouds-day": '<path class="wl-sun" d="M14.2 9.8L14.19 10.08L14.16 10.36L14.11 10.63L14.05 10.9L13.96 11.17L13.85 11.43L13.73 11.68L13.59 11.92L13.44 12.15L13.26 12.37L13.08 12.58L12.88 12.77L12.66 12.95L12.44 13.12L12.2 13.26L11.95 13.4L11.7 13.51L11.44 13.6L11.17 13.68L10.89 13.74L10.62 13.78L10.34 13.8L10.06 13.8L9.78 13.78L9.51 13.74L9.23 13.68L8.96 13.6L8.7 13.51L8.45 13.4L8.2 13.26L7.96 13.12L7.74 12.95L7.52 12.77L7.32 12.58L7.14 12.37L6.96 12.15L6.81 11.92L6.67 11.68L6.55 11.43L6.44 11.17L6.35 10.9L6.29 10.63L6.24 10.36L6.21 10.08L6.2 9.8L6.21 9.52L6.24 9.24L6.29 8.97L6.35 8.7L6.44 8.43L6.55 8.17L6.67 7.92L6.81 7.68L6.96 7.45L7.14 7.23L7.32 7.02L7.52 6.83L7.74 6.65L7.96 6.48L8.2 6.34L8.45 6.2L8.7 6.09L8.96 6L9.23 5.92L9.51 5.86L9.78 5.82L10.06 5.8L10.34 5.8L10.62 5.82L10.89 5.86L11.17 5.92L11.44 6L11.7 6.09L11.95 6.2L12.2 6.34L12.44 6.48L12.66 6.65L12.88 6.83L13.08 7.02L13.26 7.23L13.44 7.45L13.59 7.68L13.73 7.92L13.85 8.17L13.96 8.43L14.05 8.7L14.11 8.97L14.16 9.24L14.19 9.52L14.2 9.8"/><path class="wl-sun" d="M16.1 9.8L17.8 9.8M6.03 13.97L4.83 15.17M4.3 9.8L2.6 9.8M6.03 5.63L4.83 4.43M10.2 3.9L10.2 2.2M14.37 5.63L15.57 4.43"/><path d="M12.35 20A1.92 1.92 0 0 1 12.26 16.16A2.85 2.85 0 0 1 17.44 15.69A2.17 2.17 0 1 1 17.8 20Z"/>',
    "few-clouds-night": '<path class="wl-moon" d="M9.46 15.93L9.15 15.87L8.85 15.8L8.55 15.71L8.25 15.6L7.96 15.48L7.68 15.35L7.4 15.2L7.13 15.03L6.87 14.85L6.62 14.66L6.39 14.46L6.16 14.24L5.94 14.01L5.74 13.78L5.55 13.53L5.37 13.27L5.2 13L5.05 12.72L4.92 12.44L4.8 12.15L4.69 11.85L4.6 11.55L4.53 11.25L4.47 10.94L4.43 10.63L4.41 10.31L4.4 10L4.41 9.69L4.43 9.37L4.47 9.06L4.53 8.75L4.6 8.45L4.69 8.15L4.8 7.85L4.92 7.56L5.05 7.28L5.2 7L5.37 6.73L5.55 6.47L5.74 6.22L5.94 5.99L6.16 5.76L6.39 5.54L6.62 5.34L6.87 5.15L7.13 4.97L7.4 4.8L7.68 4.65L7.96 4.52L8.25 4.4L8.55 4.29L8.85 4.2L9.15 4.13L9.33 4.13L9.17 4.36L9.02 4.6L8.89 4.85L8.77 5.1L8.66 5.36L8.56 5.63L8.48 5.9L8.42 6.18L8.37 6.46L8.33 6.74L8.31 7.02L8.3 7.3L8.31 7.58L8.33 7.86L8.37 8.14L8.42 8.42L8.48 8.7L8.56 8.97L8.66 9.24L8.77 9.5L8.89 9.75L9.02 10L9.17 10.24L9.33 10.47L9.5 10.7L9.69 10.91L9.88 11.12L10.09 11.31L10.3 11.5L10.53 11.67L10.76 11.83L11 11.98L11.25 12.11L11.5 12.23L11.76 12.34L12.03 12.44L12.3 12.52L12.58 12.58L12.86 12.63L13.14 12.67L13.42 12.69L13.7 12.7L13.98 12.69L14.26 12.67L14.54 12.63L14.82 12.58L15.1 12.52L15.37 12.44L15.64 12.34L15.9 12.23L15.88 12.44L15.88 12.44L15.75 12.72"/><path d="M12.35 20A1.92 1.92 0 0 1 12.26 16.16A2.85 2.85 0 0 1 17.44 15.69A2.17 2.17 0 1 1 17.8 20Z"/>',
    "partly-cloudy-day": '<path class="wl-sun" d="M8.2 11.8L7.98 11.74L7.76 11.66L7.55 11.57L7.35 11.46L7.15 11.34L6.97 11.2L6.79 11.05L6.63 10.89L6.47 10.72L6.33 10.54L6.2 10.35L6.09 10.15L5.99 9.94L5.9 9.73L5.83 9.51L5.77 9.29L5.73 9.06L5.71 8.83L5.7 8.6L5.71 8.37L5.73 8.14L5.77 7.91L5.83 7.69L5.9 7.47L5.99 7.26L6.09 7.05L6.2 6.85L6.33 6.66L6.47 6.48L6.63 6.31L6.79 6.15L6.97 6L7.15 5.86L7.35 5.74L7.55 5.63L7.76 5.54L7.98 5.46L8.2 5.4L8.43 5.35L8.66 5.32L8.88 5.3L9.12 5.3L9.34 5.32L9.57 5.35L9.8 5.4L10.02 5.46L10.24 5.54L10.45 5.63L10.65 5.74L10.85 5.86L11.03 6L11.21 6.15L11.37 6.31L11.53 6.48L11.67 6.66L11.8 6.85L11.91 7.05L12.01 7.26L12.1 7.47L12.17 7.69L12.23 7.91L12.27 8.14L12.29 8.37L12.3 8.6L12.3 8.6L12.29 8.83L12.27 9.06"/><path class="wl-sun" d="M13.9 8.6L15.4 8.6M5.54 12.06L4.47 13.13M4.1 8.6L2.6 8.6M5.54 5.14L4.47 4.07M9 3.7L9 2.2M12.46 5.14L13.53 4.07"/><path d="M9.37 19.2A2.85 2.85 0 0 1 9.23 13.5A4.23 4.23 0 0 1 16.92 12.81A3.22 3.22 0 1 1 17.46 19.2Z"/>',
    "partly-cloudy-night": '<path class="wl-moon" d="M6.68 12.79L6.46 12.65L6.25 12.49L6.05 12.32L5.86 12.14L5.68 11.95L5.51 11.75L5.35 11.54L5.21 11.32L5.07 11.1L4.94 10.87L4.83 10.63L4.73 10.39L4.64 10.15L4.57 9.89L4.51 9.64L4.46 9.38L4.43 9.12L4.41 8.86L4.4 8.6L4.41 8.34L4.43 8.08L4.46 7.82L4.51 7.56L4.57 7.31L4.64 7.05L4.73 6.81L4.83 6.57L4.94 6.33L5.07 6.1L5.21 5.88L5.35 5.66L5.51 5.45L5.68 5.25L5.86 5.06L6.05 4.88L6.25 4.71L6.46 4.55L6.68 4.41L6.9 4.27L7.13 4.14L7.37 4.03L7.61 3.93L7.85 3.84L8.11 3.77L8.36 3.71L8.51 3.7L8.38 3.9L8.25 4.1L8.14 4.31L8.04 4.52L7.95 4.74L7.87 4.96L7.8 5.19L7.75 5.41L7.71 5.65L7.67 5.88L7.66 6.11L7.65 6.35L7.66 6.59L7.67 6.82L7.71 7.05L7.75 7.29L7.8 7.51L7.87 7.74L7.95 7.96L8.04 8.18L8.14 8.39L8.25 8.6L8.38 8.8L8.51 9L8.65 9.18L8.81 9.36L8.97 9.53L9.14 9.69L9.32 9.85L9.5 9.99L9.7 10.12"/><path d="M9.37 19.2A2.85 2.85 0 0 1 9.23 13.5A4.23 4.23 0 0 1 16.92 12.81A3.22 3.22 0 1 1 17.46 19.2Z"/>',
    "overcast": '<path d="M11.75 8.86L11.86 8.81L11.97 8.76L12.09 8.72L12.2 8.69L12.32 8.66L12.44 8.64L12.56 8.62L12.68 8.62L12.73 8.5L12.79 8.34L12.87 8.18L12.96 8.02L13.05 7.87L13.15 7.72L13.26 7.58L13.37 7.44L13.5 7.32L13.63 7.19L13.76 7.08L13.9 6.97L14.05 6.87L14.2 6.77L14.36 6.69L14.52 6.61L14.68 6.54L14.85 6.48L15.02 6.43L15.2 6.39L15.37 6.36L15.55 6.34L15.73 6.32L15.9 6.32L16.08 6.32L16.26 6.34L16.44 6.36L16.61 6.39L16.79 6.43L16.96 6.48L17.12 6.54L17.29 6.61L17.45 6.69L17.61 6.77L17.76 6.87L17.9 6.97L18.05 7.08L18.18 7.19L18.31 7.32L18.43 7.44L18.55 7.58L18.66 7.72L18.76 7.87L18.85 8.02L18.9 8.05L19.04 8.03L19.17 8.02L19.31 8.02L19.44 8.02L19.58 8.03L19.71 8.05L19.85 8.08L19.98 8.11L20.11 8.15L20.24 8.19L20.36 8.24L20.48 8.3L20.6 8.37L20.72 8.44L20.83 8.51L20.94 8.6L21.04 8.69L21.14 8.78L21.23 8.88L21.32 8.98L21.4 9.09L21.48 9.2L21.55 9.31L21.62 9.43L21.67 9.56L21.73 9.68L21.77 9.81L21.81 9.94L21.84 10.07L21.87 10.2L21.88 10.34L21.89 10.47L21.9 10.61L21.9 10.61L21.89 10.75L21.88 10.88L21.87 11.02L21.84 11.15L21.81 11.28L21.77 11.41L21.73 11.54L21.67 11.66L21.62 11.79L21.55 11.9L21.48 12.02L21.4 12.13L21.32 12.24L21.23 12.34L21.14 12.44L21.04 12.53L20.94 12.62L20.83 12.71L20.72 12.78L20.6 12.85L20.48 12.92L20.36 12.98L20.24 13.03L20.11 13.07L19.98 13.11L19.85 13.14L19.31 13.2L19.04 13.2"/><path d="M6.68 19A2.91 2.91 0 0 1 6.54 13.18A4.32 4.32 0 0 1 14.4 12.47A3.29 3.29 0 1 1 14.95 19Z"/>',
    "fog": '<path d="M7.6 14.4A3.1 3.1 0 0 1 7.45 8.2A4.6 4.6 0 0 1 15.81 7.45A3.5 3.5 0 1 1 16.4 14.4Z"/><path d="M4.5 17.6h15M7 20.6h10"/>',
    "drizzle": '<path d="M7.6 15.2A3.1 3.1 0 0 1 7.45 9A4.6 4.6 0 0 1 15.81 8.25A3.5 3.5 0 1 1 16.4 15.2Z"/><path class="wl-rain wl-dot" d="M9.4 18.6h.01M12.6 18.6h.01M15.8 18.6h.01M11 21.4h.01M14.2 21.4h.01"/>',
    "light-rain": '<path d="M7.6 15.2A3.1 3.1 0 0 1 7.45 9A4.6 4.6 0 0 1 15.81 8.25A3.5 3.5 0 1 1 16.4 15.2Z"/><path class="wl-rain" d="M10.6 18.2L9.7 21M14.4 18.2L13.5 21"/>',
    "moderate-rain": '<path d="M7.6 15.2A3.1 3.1 0 0 1 7.45 9A4.6 4.6 0 0 1 15.81 8.25A3.5 3.5 0 1 1 16.4 15.2Z"/><path class="wl-rain" d="M8.8 18.2L7.9 21.4M12.2 18.2L11.3 21.4M15.6 18.2L14.7 21.4"/>',
    "heavy-rain": '<path d="M7.6 15.2A3.1 3.1 0 0 1 7.45 9A4.6 4.6 0 0 1 15.81 8.25A3.5 3.5 0 1 1 16.4 15.2Z"/><path class="wl-rain wl-heavy" d="M7.8 18L6.4 22.2M11 18L9.6 22.2M14.2 18L12.8 22.2M17.4 18L16 22.2"/>',
    "showers": '<path class="wl-sun" d="M6.17 9.66L6.09 9.46L6.02 9.25L5.97 9.04L5.93 8.83L5.91 8.62L5.9 8.4L5.91 8.18L5.93 7.97L5.97 7.76L6.02 7.55L6.09 7.34L6.17 7.14L6.26 6.94L6.37 6.76L6.49 6.58L6.63 6.41L6.77 6.25L6.93 6.1L7.09 5.96L7.27 5.83L7.45 5.72L7.64 5.61L7.84 5.53L8.04 5.45L8.25 5.39L8.46 5.35L8.68 5.32L8.89 5.3L9.11 5.3L9.32 5.32L9.54 5.35L9.75 5.39L9.96 5.45L10.16 5.53L10.36 5.61L10.55 5.72L10.73 5.83L10.91 5.96"/><path class="wl-sun" d="M4.4 8.4L3 8.4M5.75 5.15L4.76 4.16M9 3.8L9 2.4M12.25 5.15L13.24 4.16"/><path d="M9.37 15.6A2.85 2.85 0 0 1 9.23 9.9A4.23 4.23 0 0 1 16.92 9.21A3.22 3.22 0 1 1 17.46 15.6Z"/><path class="wl-rain" d="M11.2 18.6L10.3 21.4M15 18.6L14.1 21.4"/>',
    "showers-night": '<path class="wl-moon" d="M5.42 10.5L5.3 10.29L5.2 10.07L5.11 9.85L5.03 9.62L4.96 9.39L4.9 9.16L4.86 8.92L4.83 8.68L4.81 8.44L4.8 8.2L4.81 7.96L4.83 7.72L4.86 7.48L4.9 7.24L4.96 7.01L5.03 6.78L5.11 6.55L5.2 6.33L5.3 6.11L5.42 5.9L5.54 5.69L5.68 5.5L5.83 5.31L5.98 5.12L6.15 4.95L6.32 4.78L6.51 4.63L6.7 4.48L6.89 4.34L7.1 4.22L7.31 4.1L7.53 4L7.75 3.91L7.98 3.83L8.21 3.76L8.44 3.7L8.58 3.7L8.46 3.88L8.34 4.06L8.24 4.25L8.15 4.45L8.06 4.65L7.99 4.85L7.93 5.06L7.88 5.27L7.84 5.48L7.81 5.7L7.8 5.91L7.79 6.13L7.8 6.35L7.81 6.56L7.84 6.78L7.88 6.99L7.93 7.2L7.99 7.41L8.06 7.61L8.15 7.81L8.24 8.01L8.34 8.2"/><path d="M9.37 15.6A2.85 2.85 0 0 1 9.23 9.9A4.23 4.23 0 0 1 16.92 9.21A3.22 3.22 0 1 1 17.46 15.6Z"/><path class="wl-rain" d="M11.2 18.6L10.3 21.4M15 18.6L14.1 21.4"/>',
    "sleet": '<path d="M7.6 15.2A3.1 3.1 0 0 1 7.45 9A4.6 4.6 0 0 1 15.81 8.25A3.5 3.5 0 1 1 16.4 15.2Z"/><path class="wl-rain" d="M9.6 18.2L8.7 21M15.2 18.2L14.3 21"/><path class="wl-dot" d="M12.4 19.8h.01"/>',
    "snow": '<path d="M7.6 15.2A3.1 3.1 0 0 1 7.45 9A4.6 4.6 0 0 1 15.81 8.25A3.5 3.5 0 1 1 16.4 15.2Z"/><path class="wl-dot" d="M8.8 18.8h.01M12.2 18.8h.01M15.6 18.8h.01M10.5 21.6h.01M13.9 21.6h.01"/>',
    "thunderstorm": '<path d="M7.6 15.2A3.1 3.1 0 0 1 7.45 9A4.6 4.6 0 0 1 15.81 8.25A3.5 3.5 0 1 1 16.4 15.2Z"/><path class="wl-bolt" d="M13 16.4 10.6 19.6h3l-2.2 3.2"/>',
    "thunderstorm-hail": '<path d="M7.6 15.2A3.1 3.1 0 0 1 7.45 9A4.6 4.6 0 0 1 15.81 8.25A3.5 3.5 0 1 1 16.4 15.2Z"/><path class="wl-bolt" d="M12 16.4 9.6 19.6h3l-2.2 3.2"/><path class="wl-dot" d="M15.6 18.8h.01M16.6 21.6h.01"/>',
    "weather-unknown": '<path d="M7.6 18.6A3.1 3.1 0 0 1 7.45 12.4A4.6 4.6 0 0 1 15.81 11.65A3.5 3.5 0 1 1 16.4 18.6Z"/>',
  });
  // linha:fim
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
