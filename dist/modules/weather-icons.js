(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.weatherIcons = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BASE = "./vendor/weathericons/";
  const CONDITIONS = {
    0: ["clear", "Céu limpo"],
    1: ["mostly-clear", "Predomínio de sol"],
    2: ["partly-cloudy", "Parcialmente nublado"],
    3: ["overcast", "Céu encoberto"],
    45: ["fog", "Neblina"], 48: ["fog", "Neblina com depósito"],
    51: ["drizzle", "Garoa fraca"], 53: ["drizzle", "Garoa"], 55: ["drizzle", "Garoa intensa"],
    56: ["freezing-drizzle", "Garoa congelante fraca"], 57: ["freezing-drizzle", "Garoa congelante intensa"],
    61: ["light-rain", "Chuva fraca"], 63: ["rain", "Chuva moderada"], 65: ["heavy-rain", "Chuva forte"],
    66: ["freezing-rain", "Chuva congelante fraca"], 67: ["freezing-rain", "Chuva congelante forte"],
    71: ["light-snow", "Neve fraca"], 73: ["snow", "Neve moderada"], 75: ["heavy-snow", "Neve forte"],
    77: ["snow-grains", "Grãos de neve"],
    80: ["light-showers", "Pancadas fracas"], 81: ["showers", "Pancadas de chuva"], 82: ["heavy-showers", "Pancadas fortes"],
    85: ["snow-showers", "Pancadas de neve"], 86: ["heavy-snow-showers", "Pancadas fortes de neve"],
    95: ["storm", "Trovoadas"], 96: ["hail-storm", "Trovoadas com granizo"], 99: ["hail-storm", "Trovoadas fortes com granizo"]
  };

  function condition(code) {
    const value = CONDITIONS[Number(code)] || ["variable", "Tempo variável"];
    return { key: value[0], label: value[1] };
  }

  function assetFor(code, isDay = true) {
    const key = condition(code).key;
    if (key === "clear") return isDay ? "Sun.svg" : "Moon.svg";
    if (key === "mostly-clear" || key === "partly-cloudy") return isDay ? "PartlySunny.svg" : "PartlyMoon.svg";
    if (key === "overcast" || key === "variable") return "Cloud.svg";
    if (key === "fog") return "Haze.svg";
    if (key.includes("snow")) return "Snow.svg";
    if (key === "hail-storm") return "Hail.svg";
    if (key === "storm") return "Storm.svg";
    return "Rain.svg";
  }

  function icon(code, isDay = true, options = {}) {
    const info = condition(code);
    return {
      ...info,
      asset: assetFor(code, isDay),
      src: `${BASE}${assetFor(code, isDay)}`,
      isDay: Boolean(isDay),
      label: options.label || info.label
    };
  }

  function markup(code, isDay = true, options = {}) {
    const item = icon(code, isDay, options);
    const className = String(options.className || "weather-icon").replace(/[^a-zA-Z0-9 _-]/g, "");
    const label = String(item.label).replace(/[&<>\"]/g, value => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[value]);
    const accessibility = options.decorative === false ? `alt="${label}"` : 'alt="" aria-hidden="true"';
    return `<img class="${className}" src="${item.src}" ${accessibility} width="1000" height="1000" loading="${options.eager ? "eager" : "lazy"}" decoding="async">`;
  }

  function isDayAt(iso, sunrise, sunset) {
    const value = Date.parse(iso);
    const rise = Date.parse(sunrise);
    const set = Date.parse(sunset);
    return Number.isFinite(value) && Number.isFinite(rise) && Number.isFinite(set) ? value >= rise && value < set : true;
  }

  return { CONDITIONS, condition, assetFor, icon, markup, isDayAt };
});
