function isManaus(city = activeCity) {
  return Boolean(city && (city.id === "1302603" || (city.uf === "AM" && normalizeName(city.name) === "manaus")));
}
function cityNameUnique(name) {
  const n = normalizeName(name);
  let count = 0;
  for (const city of CITIES) {
    if (normalizeName(city.name) === n) {
      count++;
      if (count > 1) return false;
    }
  }
  return count === 1;
}
function hourLabel(iso) {
  const raw = (iso || "").slice(11, 16);
  if (!raw) return "--";
  return raw.replace(/^0/, "");
}
function pinTop() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}
function revealWeather() {
  const welcome = document.getElementById("locationWelcome");
  const view = document.getElementById("weatherView");
  const nav = document.getElementById("siteNav");
  if (welcome) welcome.hidden = true;
  if (view) view.hidden = false;
  if (nav) nav.hidden = false;
  pinTop();
  requestAnimationFrame(pinTop);
  setTimeout(pinTop, 50);
}
function dismissIntro() {
  const intro = document.getElementById("pluviaIntro");
  if (!intro || intro.hidden || intro.dataset.done) return;
  intro.dataset.done = "1";
  intro.classList.add("is-leaving");
  revealWeather();
  setTimeout(() => { intro.hidden = true; pinTop(); }, 480);
}
function buildRainPhrase(hourly) {
  const times = hourly?.time || [];
  const probs = hourly?.precipitation_probability || [];
  const mms = hourly?.precipitation || hourly?.rain || [];
  const start = typeof selectCurrentHour === "function" ? selectCurrentHour(times) : 0;
  const end = Math.min(times.length, start + 18);
  let phrase = "Próximas horas sem chuva clara.";
  let severity = "dry";
  let peakMm = 0;
  let peakProb = 0;
  let firstWet = -1;
  let lastWet = -1;
  for (let i = start; i < end; i++) {
    const mm = Number(mms[i]) || 0;
    const prob = Number(probs[i]) || 0;
    if (mm > peakMm) peakMm = mm;
    if (prob > peakProb) peakProb = prob;
    if (prob >= 40 && mm >= 0.4) {
      if (firstWet < 0) firstWet = i;
      lastWet = i;
    }
  }
  const sum3 = mms.slice(start, start + 3).reduce((a, b) => a + (Number(b) || 0), 0);
  let dryStart = -1, dryLen = 0, bestDry = 0, bestDryAt = -1;
  for (let i = start; i < end; i++) {
    const dry = (Number(mms[i]) || 0) < 0.2 && (Number(probs[i]) || 0) < 30;
    if (dry) {
      if (dryStart < 0) dryStart = i;
      dryLen++;
      if (dryLen > bestDry) { bestDry = dryLen; bestDryAt = dryStart; }
    } else { dryStart = -1; dryLen = 0; }
  }
  if (sum3 >= 15) {
    severity = "heavy";
    phrase = `Volume alto das ${hourLabel(times[start])} às ${hourLabel(times[Math.min(start + 2, times.length - 1)])}. Pode alagar via.`;
  } else if (firstWet >= 0) {
    severity = "wet";
    const from = hourLabel(times[firstWet]);
    const to = hourLabel(times[Math.max(firstWet, lastWet)]);
    phrase = firstWet === start ? `Chuva agora até ${to}.` : `Chuva das ${from} às ${to}.`;
  } else if (peakProb >= 55 && peakMm < 0.4) {
    severity = "threat";
    phrase = "Nuvem ameaça, mas o volume previsto é baixo.";
  } else if (bestDry >= 3 && bestDryAt === start) {
    phrase = `Próximas ${bestDry}h secas.`;
  } else if (bestDry >= 3) {
    phrase = `Janela seca às ${hourLabel(times[bestDryAt])} · ${bestDry}h.`;
  }
  if (phrase.length > 140) phrase = phrase.slice(0, 137) + "…";
  return { phrase, severity };
}
function aqiLabel(value) {
  if (!Number.isFinite(value)) return ["--", "índice internacional indisponível"];
  if (value <= 50) return ["Boa", `US AQI ${Math.round(value)} · traduzido`];
  if (value <= 100) return ["Moderada", `US AQI ${Math.round(value)} · traduzido`];
  if (value <= 150) return ["Ruim p/ sensíveis", `US AQI ${Math.round(value)} · traduzido`];
  if (value <= 200) return ["Ruim", `US AQI ${Math.round(value)} · traduzido`];
  if (value <= 300) return ["Muito ruim", `US AQI ${Math.round(value)} · traduzido`];
  return ["Péssima", `US AQI ${Math.round(value)} · traduzido`];
}
const _inmetArea = inmetArea;
inmetArea = function (alert) {
  const codes = JSON.stringify(alert.geocodes || alert.geocode || "").match(/\b\d{7}\b/g) || [];
  if (codes.length) return codes.includes(String(activeCity.id)) ? activeCity.name : null;
  const contains = (value, name) => new RegExp("(^|[^a-z])" + normalizeName(name) + "([^a-z]|$)").test(normalizeName(JSON.stringify(value || "")));
  const towns = alert.municipios || alert.municipio;
  if (towns && contains(towns, activeCity.name)) {
    const blob = normalizeName(JSON.stringify([alert.estados, alert.uf, alert.sigla, alert.area, alert.areaDesc]));
    const ufOk = blob.includes(normalizeName(activeCity.uf)) || blob.includes(normalizeName(activeCity.state || ""));
    if (cityNameUnique(activeCity.name) || ufOk) return activeCity.name;
    return null;
  }
  return _inmetArea(alert);
};
const _loadDefesa = loadDefesaAlerts;
loadDefesaAlerts = async function (revision = cityRevision) {
  const card = document.getElementById("defesaCard");
  if (!isManaus()) {
    if (card) card.hidden = true;
    return;
  }
  if (card) card.hidden = false;
  return _loadDefesa(revision);
};
const _renderRain = renderRain;
renderRain = function (hourly, start) {
  _renderRain(hourly, start);
  const rain = buildRainPhrase(hourly);
  const phrase = document.getElementById("rainPhrase");
  const meta = document.getElementById("rainPhraseMeta");
  if (phrase) phrase.textContent = rain.phrase;
  if (meta) meta.textContent = rain.severity === "heavy" ? "volume alto nas próximas horas" : rain.severity === "threat" ? "probabilidade sem volume" : "leitura das próximas 12–18h";
};
const _updateCityLabels = updateCityLabels;
updateCityLabels = function () {
  _updateCityLabels();
  if (!activeCity) return;
  const label = document.getElementById("selectedCityLabel");
  if (label) label.textContent = activeCity.name;
  const dist = document.getElementById("cityDistance");
  if (dist) {
    dist.hidden = !(activeCity.distanceKm >= 2);
    if (activeCity.distanceKm >= 2) dist.textContent = "a " + Math.round(activeCity.distanceKm) + " km de " + activeCity.name + " · " + activeCity.uf;
  }
  const card = document.getElementById("defesaCard");
  if (card) card.hidden = !isManaus();
  const forecast = document.getElementById("forecastCityLabel");
  if (forecast) forecast.textContent = "Referência do município de " + activeCity.name + " — não da sua rua.";
};
function unlockLocation() {
  window.__pluviaAllowGeo = true;
  if (typeof locationPending !== "undefined") locationPending = false;
  if (typeof locationButtons === "function") locationButtons(false);
  if (window.__pluviaGeo && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition = window.__pluviaGeo;
  }
}
const _requestLocation = requestLocation;
requestLocation = function () {
  unlockLocation();
  return _requestLocation();
};
document.addEventListener("click", event => {
  if (event.target.closest("#welcomeLocate, #locateCity")) unlockLocation();
}, true);
["welcomeLocate", "locateCity"].forEach(id => {
  document.getElementById(id)?.addEventListener("click", event => {
    event.preventDefault();
    unlockLocation();
    _requestLocation();
  });
});
document.getElementById("cityResults")?.addEventListener("click", event => {
  const btn = event.target.closest("[data-id]");
  if (btn) chooseCity(btn.dataset.id);
});
weatherIconSvg = function (code, isDay = true) {
  const type = weatherIconType(code);
  const sun = `<g class="wx-sun"><g class="wx-sun-rays"><path d="M52 5v10M52 69v10M15 42H5M99 42H89M26 16l7 7M78 61l7 7M26 68l7-7M78 23l7-7" /></g><circle class="wx-sun-core" cx="52" cy="42" r="20" /><circle class="wx-sun-glass" cx="46" cy="36" r="7" /></g>`;
  const moonGlyph = `<path class="wx-moon-core" d="M67 8c-4 5-6 12-6 19 0 15 12 27 27 27 4 0 8-1 12-3-4 15-17 26-33 26-19 0-34-15-34-34C33 25 48 10 67 8Z" /><circle class="wx-moon-crater wx-moon-crater-a" cx="53" cy="29" r="4" /><circle class="wx-moon-crater wx-moon-crater-b" cx="47" cy="46" r="2.8" />`;
  const moonClear = `<g class="wx-moon"><g transform="translate(-8,8) scale(.92)">${moonGlyph}</g></g>`;
  const moonBehind = `<g class="wx-moon"><g transform="translate(-32,-8) scale(.92)">${moonGlyph}</g></g>`;
  const cloudBack = `<g class="wx-cloud-back"><path d="M28 62c-9 0-15-6-15-14 0-7 5-13 12-14 3-10 12-16 23-16 13 0 23 9 24 22 9 1 15 7 15 15 0 9-7 16-17 16H28z" /></g>`;
  const cloud = `<g class="wx-cloud-main"><path class="wx-cloud-shadow" d="M27 78C15 78 7 70 7 60c0-10 8-18 18-19 4-14 16-23 31-23 17 0 30 12 31 29 12 1 21 10 21 22 0 13-10 23-24 23H27z" /><path class="wx-cloud-body" d="M25 73C14 73 8 66 8 58c0-9 7-16 17-17 4-13 15-21 29-21 16 0 28 11 29 27 11 1 19 9 19 19 0 12-9 21-22 21H25z" /><path class="wx-cloud-shine" d="M24 48c4-1 8 0 11 2 4-13 14-20 27-20 7 0 13 2 18 7-5-9-14-15-26-15-14 0-25 8-29 21-8 1-14 5-17 11 4-3 9-5 16-6z" /></g>`;
  const rain = `<g class="wx-rain"><path class="wx-drop wx-drop-1" d="M34 86l-5 10"/><path class="wx-drop wx-drop-2" d="M58 88l-5 10"/><path class="wx-drop wx-drop-3" d="M82 86l-5 10"/></g>`;
  const lightning = `<path class="wx-lightning" d="M59 79H47l-5 14h10l-4 18 20-25H57z" />`;
  if (!isDay) {
    if (type === "sun") return `<svg class="weather-visual weather-night weather-moon" viewBox="0 0 112 108" aria-hidden="true">${moonClear}</svg>`;
    if (type === "partly") return `<svg class="weather-visual weather-night weather-night-partly" viewBox="0 0 112 108" aria-hidden="true">${moonBehind}${cloud}</svg>`;
    if (type === "cloud") return `<svg class="weather-visual weather-night weather-cloud weather-night-cloud" viewBox="0 0 112 108" aria-hidden="true">${moonBehind}${cloudBack}${cloud}</svg>`;
    if (type === "storm") return `<svg class="weather-visual weather-night weather-storm weather-night-storm" viewBox="0 0 112 108" aria-hidden="true">${moonBehind}${cloud}${rain}${lightning}</svg>`;
    return `<svg class="weather-visual weather-night weather-rain weather-night-rain" viewBox="0 0 112 108" aria-hidden="true">${moonBehind}${cloud}${rain}</svg>`;
  }
  if (type === "sun") return `<svg class="weather-visual weather-sun" viewBox="0 0 112 108" aria-hidden="true">${sun}</svg>`;
  if (type === "partly") return `<svg class="weather-visual weather-partly" viewBox="0 0 112 108" aria-hidden="true"><g class="wx-sun" transform="translate(-10 -10) scale(.82)">${sun.replace('<g class="wx-sun">', "<g>")}</g>${cloud}</svg>`;
  if (type === "cloud") return `<svg class="weather-visual weather-cloud" viewBox="0 0 112 108" aria-hidden="true">${cloudBack}${cloud}</svg>`;
  if (type === "storm") return `<svg class="weather-visual weather-storm" viewBox="0 0 112 108" aria-hidden="true">${cloud}${rain}${lightning}</svg>`;
  return `<svg class="weather-visual weather-rain" viewBox="0 0 112 108" aria-hidden="true">${cloud}${rain}</svg>`;
};
(function bootCity() {
  const savedId = typeof readPreference === "function" ? readPreference("pluvia-city", null) : null;
  const fallback = cityById.get("1302603") || CITIES.find(city => city.uf === "AM");
  const city = cityById.get(savedId) || fallback;
  if (city && (!activeCity || activeCity.id !== city.id)) chooseCity(city.id);
  else if (city) updateCityLabels();
  const welcome = document.getElementById("locationWelcome");
  if (welcome) welcome.hidden = true;
  pinTop();
  setTimeout(dismissIntro, 1600);
})();
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
