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
document.getElementById("skipIntro")?.addEventListener("click", dismissIntro);
function buildRainPhrase(hourly) {
  const times = hourly?.time || [];
  const probs = hourly?.precipitation_probability || [];
  const mms = hourly?.precipitation || hourly?.rain || [];
  const start = typeof selectCurrentHour === "function" ? selectCurrentHour(times) : 0;
  const end = Math.min(times.length, start + 18);
  let phrase = "Próximas horas sem chuva clara.";
  let severity = "dry";
  let peakMm = 0;
  let peakAt = -1;
  let peakProb = 0;
  let firstWet = -1;
  let lastWet = -1;
  for (let i = start; i < end; i++) {
    const mm = Number(mms[i]) || 0;
    const prob = Number(probs[i]) || 0;
    if (mm > peakMm) { peakMm = mm; peakAt = i; }
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
    phrase = `Chuva pesada entre ${hourLabel(times[start])} e ${hourLabel(times[Math.min(start + 2, times.length - 1)])}. Em área que alaga, muda a rota.`;
  } else if (firstWet >= 0) {
    severity = "wet";
    const from = hourLabel(times[firstWet]);
    const to = hourLabel(times[Math.min(lastWet + 1, times.length - 1)]);
    const wetHours = Math.max(1, lastWet - firstWet + 1);
    const startsLightAndGetsHeavy = firstWet === start && (Number(mms[start]) || 0) < 1 && peakMm >= 3 && peakAt > start;
    phrase = startsLightAndGetsHeavy ? `Chuvisco agora, mais pesado depois das ${hourLabel(times[peakAt])}.` : firstWet === start ? `Chuva agora, com trégua perto das ${to}.` : wetHours <= 2 ? `Pancada curta perto das ${from}.` : `Chuva prevista entre ${from} e ${to}.`;
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
  if (!Number.isFinite(value)) return ["--", "qualidade do ar indisponível"];
  if (value <= 50) return ["Boa", `Índice ${Math.round(value)} · ar limpo`];
  if (value <= 100) return ["Moderada", `Índice ${Math.round(value)} · atenção se você é sensível`];
  if (value <= 150) return ["Ruim p/ sensíveis", `Índice ${Math.round(value)} · asma, criança e idoso sentem mais`];
  if (value <= 200) return ["Ruim", `Índice ${Math.round(value)} · evite esforço ao ar livre`];
  if (value <= 300) return ["Muito ruim", `Índice ${Math.round(value)} · partículas altas`];
  return ["Péssima", `Índice ${Math.round(value)} · exposição perigosa`];
}
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
  if (card) card.hidden = false;
  const actions = document.getElementById("defesaActions");
  if (actions) actions.hidden = activeCity.uf !== "AM";
  const forecast = document.getElementById("forecastCityLabel");
  if (forecast) forecast.textContent = "Referência do município de " + activeCity.name + " — não da sua rua.";
  globalThis.PLUVIA?.modules?.['weather-layers']?.cityChanged?.(activeCity);
};
let activeResultIndex = -1;
renderCityOptions = function () {
  const query = normalizeName(document.getElementById("citySearch").value || "").trim();
  const initial = [...new Map([
    ...[...favorites].map(id => cityById.get(id)),
    activeCity,
    ...CAPITALS
  ].filter(Boolean).map(city => [city.id, city])).values()];
  const matches = query ? searchCities(query) : initial;
  const shown = matches.slice(0, 12);
  const list = document.getElementById("cityResults");
  activeResultIndex = -1;
  list.innerHTML = shown.map(city => {
    const capital = CAPITALS.some(item => item.id === city.id);
    return `<li><button class="city-result" type="button" role="option" aria-selected="false" data-id="${city.id}"><span>${favorites.has(city.id) ? "★ " : ""}${escapeHtml(city.name)}/${city.uf}</span><small>${escapeHtml(city.state || city.uf)}${capital ? " · capital" : ""}</small></button></li>`;
  }).join("");
  document.getElementById("cityPickerStatus").textContent = !cityIndexReady ? "Capitais disponíveis. Digite para carregar o índice de municípios." : !shown.length ? "Não achei essa cidade. Tenta sem acento ou confira o nome." : query ? `${matches.length} resultado${matches.length === 1 ? "" : "s"}` : "Favoritas primeiro, depois capitais.";
};

function moveCityResult(direction) {
  const items = [...document.querySelectorAll(".city-result")];
  if (!items.length) return;
  activeResultIndex = (activeResultIndex + direction + items.length) % items.length;
  items.forEach((item, index) => item.setAttribute("aria-selected", String(index === activeResultIndex)));
  items[activeResultIndex].focus();
}

document.getElementById("citySearch")?.addEventListener("keydown", event => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); moveCityResult(event.key === "ArrowDown" ? 1 : -1); }
  else if (event.key === "Enter") {
    const first = document.querySelector(".city-result");
    if (first) { event.preventDefault(); chooseCity(first.dataset.id); }
  } else if (event.key === "Escape") closeCitySearch();
});
document.getElementById("cityResults")?.addEventListener("keydown", event => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); moveCityResult(event.key === "ArrowDown" ? 1 : -1); }
  else if (event.key === "Enter") { event.preventDefault(); chooseCity(event.target.closest("[data-id]")?.dataset.id); }
  else if (event.key === "Escape") closeCitySearch();
});
document.getElementById("cityResults")?.addEventListener("click", event => {
  const btn = event.target.closest("[data-id]");
  if (btn) chooseCity(btn.dataset.id);
});
(function bootCity() {
  const savedId = typeof readPreference === "function" ? readPreference("pluvia-city", null) : null;
  const fallback = cityById.get("1302603") || CITIES.find(city => city.uf === "AM");
  const saved = cityById.get(savedId);
  let fallbackTimer;
  if (saved) chooseCity(saved.id);
  else if (savedId) ensureMunicipalities().then(() => {
    if (!activeCity && cityById.has(savedId)) chooseCity(savedId);
  }).catch(() => {});
  else fallbackTimer = setTimeout(() => {
    if (activeCity || !fallback) return;
    chooseCity(fallback.id);
    const notice = document.getElementById("locationNotice");
    if (notice) {
      notice.hidden = false;
      notice.innerHTML = 'Sem localização — mostrando Manaus, cidade-mãe do PLUVIA. <button type="button" id="noticeChangeCity">Trocar cidade</button>';
      document.getElementById("noticeChangeCity")?.addEventListener("click", openCitySearch);
    }
    locationMessage("Localização indisponível. Manaus entrou como referência; você pode trocar quando quiser.");
  }, 1500);
  const intro = document.getElementById("pluviaIntro");
  const seen = sessionStorage.getItem("pluvia-intro-seen");
  if (seen && intro) intro.hidden = true;
  else sessionStorage.setItem("pluvia-intro-seen", "1");
  const welcome = document.getElementById("locationWelcome");
  if (welcome) welcome.hidden = true;
  pinTop();
  setTimeout(() => { clearTimeout(fallbackTimer); if (!activeCity && fallback) chooseCity(fallback.id); dismissIntro(); }, 1650);
})();
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
