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
    phrase = firstWet === start
      ? `Chuva agora até ${to}.`
      : `Chuva das ${from} às ${to}.`;
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
const _requestLocation = requestLocation;
requestLocation = function () {
  window.__pluviaAllowGeo = true;
  if (window.__pluviaGeo && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition = window.__pluviaGeo;
  }
  return _requestLocation();
};
document.getElementById("cityResults")?.addEventListener("click", event => {
  const btn = event.target.closest("[data-id]");
  if (btn) chooseCity(btn.dataset.id);
});
(function bootCity() {
  const savedId = typeof readPreference === "function" ? readPreference("pluvia-city", null) : null;
  const fallback = cityById.get("1302603") || CITIES.find(city => city.uf === "AM");
  const city = cityById.get(savedId) || fallback;
  if (!city) return;
  const welcome = document.getElementById("locationWelcome");
  const view = document.getElementById("weatherView");
  const nav = document.getElementById("siteNav");
  if (welcome) welcome.hidden = true;
  if (view) view.hidden = false;
  if (nav) nav.hidden = false;
  if (!activeCity || activeCity.id !== city.id) chooseCity(city.id);
  else updateCityLabels();
})();
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
