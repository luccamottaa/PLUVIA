function pinTop() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}
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
  if (actions) actions.hidden = false;
  const forecast = document.getElementById("forecastCityLabel");
  if (forecast) forecast.textContent = "Previsão para o ponto de referência de " + activeCity.name + ", não para um endereço específico.";
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
  document.getElementById("cityPickerStatus").textContent = !cityIndexReady ? "Capitais disponíveis. Digite para carregar o índice de municípios." : !shown.length ? "Cidade não encontrada. Digite o nome sem acentos ou confira a grafia." : query ? `${matches.length} resultado${matches.length === 1 ? "" : "s"}` : "Cidades favoritas e capitais.";
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
  else {
    if (typeof prefetchForecast === "function" && fallback) prefetchForecast(fallback);
    fallbackTimer = setTimeout(() => {
    if (activeCity || !fallback) return;
    chooseCity(fallback.id);
    const notice = document.getElementById("locationNotice");
    if (notice) {
      notice.hidden = false;
      notice.innerHTML = 'Localização indisponível. Manaus está selecionada como referência. <button type="button" id="noticeChangeCity">Trocar cidade</button>';
      document.getElementById("noticeChangeCity")?.addEventListener("click", openCitySearch);
    }
    locationMessage("Localização indisponível. Manaus foi selecionada como referência. É possível trocar a cidade a qualquer momento.");
  }, 1500);
  }
  const welcome = document.getElementById("locationWelcome");
  if (welcome) welcome.hidden = true;
  pinTop();
  setTimeout(() => { clearTimeout(fallbackTimer); if (!activeCity && fallback) chooseCity(fallback.id); }, 1650);
})();
if ("serviceWorker" in navigator && window.isSecureContext) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController && !reloadingForUpdate) {
      reloadingForUpdate = true;
      location.reload();
    }
  });
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js")
    .then(registration => registration.update())
    .catch(() => {}));
}
