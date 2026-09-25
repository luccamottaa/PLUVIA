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

  const BASE = "./assets/weather-icons/";
  const LEGACY_BASE = "./vendor/weathericons/";
  const CONDITIONS = Object.freeze({
    0: ["clear", "Céu limpo"], 1: ["mostly-clear", "Predomínio de céu limpo"], 2: ["partly-cloudy", "Parcialmente nublado"], 3: ["overcast", "Céu encoberto"],
    45: ["fog", "Neblina"], 48: ["fog", "Neblina com depósito"],
    51: ["drizzle", "Garoa fraca"], 53: ["drizzle", "Garoa"], 55: ["drizzle", "Garoa intensa"], 56: ["freezing-drizzle", "Garoa congelante fraca"], 57: ["freezing-drizzle", "Garoa congelante intensa"],
    61: ["light-rain", "Chuva fraca"], 63: ["rain", "Chuva moderada"], 65: ["heavy-rain", "Chuva forte"], 66: ["freezing-rain", "Chuva congelante fraca"], 67: ["freezing-rain", "Chuva congelante forte"],
    71: ["light-snow", "Neve fraca"], 73: ["snow", "Neve moderada"], 75: ["heavy-snow", "Neve forte"], 77: ["snow-grains", "Grãos de neve"],
    80: ["light-showers", "Pancadas fracas"], 81: ["showers", "Pancadas de chuva"], 82: ["heavy-showers", "Pancadas fortes"], 85: ["snow-showers", "Pancadas de neve"], 86: ["heavy-snow-showers", "Pancadas fortes de neve"],
    95: ["storm", "Trovoadas"], 96: ["hail-storm", "Trovoadas com granizo"], 99: ["hail-storm", "Trovoadas fortes com granizo"]
  });
  const ASSETS = Object.freeze({
    conditions: Object.freeze({
      "clear-day":"clear-day.svg", "clear-night":"clear-night.svg", "partly-cloudy-day":"partly-cloudy-day.svg", "partly-cloudy-night":"partly-cloudy-night.svg",
      cloudy:"cloudy.svg", overcast:"overcast.svg", fog:"fog.svg", haze:"haze.svg", "light-rain":"light-rain.svg", "moderate-rain":"moderate-rain.svg",
      "heavy-rain":"heavy-rain.svg", showers:"showers.svg", "showers-night":"showers-night.svg", thunderstorm:"thunderstorm.svg", "thunderstorm-rain":"thunderstorm-rain.svg", "thunderstorm-hail":"thunderstorm-hail.svg", snow:"snow.svg"
    }),
    metrics: Object.freeze({
      temperature:"temperature.png", "feels-like":"feels-like.png", "temperature-high":"temperature-high.png", "temperature-low":"temperature-low.png",
      humidity:"humidity.png", "dew-point":"dew-point.png", pressure:"pressure.png", visibility:"visibility.png", "wind-speed":"wind-speed.png", "wind-gust":"wind-gust.png",
      "wind-direction":"wind-direction.png", "cloud-cover":"cloud-cover.png", "uv-index":"uv-index.png", "air-quality":"air-quality.png", "rain-probability":"rain-probability.png", "rain-volume":"rain-volume.png"
    }),
    astronomy: Object.freeze({}), maps: Object.freeze({}), alerts: Object.freeze({}), status: Object.freeze({}), fallback: Object.freeze({})
  });
  const ASSET_ALIASES = Object.freeze({
    "few-clouds-day":"partly-cloudy-day",
    "few-clouds-night":"partly-cloudy-night"
  });
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
    if (["drizzle","freezing-drizzle","light-rain"].includes(key)) return "light-rain";
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
      const version = ["partly-cloudy-night", "showers-night"].includes(resolvedName) ? "?v=moon-2" : "";
      return { name, resolvedName, category, file:entries[resolvedName], src:`${BASE}${category}/${entries[resolvedName]}${version}`, source:category === "conditions" ? "pluvia-vector" : "pluvia-glossy" };
    }
    const legacy = LEGACY_FALLBACKS[name] || LEGACY_FALLBACKS["weather-unknown"];
    return { name, category:"fallback", file:legacy, src:`${LEGACY_BASE}${legacy}`, source:"weathericons-fallback" };
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
  function markup(code,isDay=true,options={}) { return imageMarkup(icon(code,isDay,options),options); }
  function markupName(name,options={}) { return imageMarkup(namedIcon(name,options),options); }
  function hydrate(scope) {
    const root = scope && typeof scope.querySelectorAll === "function" ? scope : null;
    root?.querySelectorAll("[data-weather-icon-name]").forEach(node => {
      const name = node.getAttribute("data-weather-icon-name") || "weather-unknown";
      const label = node.getAttribute("data-weather-icon-alt") || LABELS[name];
      node.innerHTML = markupName(name, { className:"metric-weather-icon", label, decorative:node.getAttribute("data-weather-icon-informative") !== "true", size:48 });
    });
  }
  function isDayAt(iso,sunrise,sunset) { const value=Date.parse(iso), rise=Date.parse(sunrise), set=Date.parse(sunset); return Number.isFinite(value)&&Number.isFinite(rise)&&Number.isFinite(set) ? value>=rise&&value<set : true; }
  return { ASSETS, ASSET_ALIASES, CONDITIONS, LABELS, condition, conditionIconName, assetFor, findAsset, icon, namedIcon, markup, markupName, hydrate, isDayAt };
});
