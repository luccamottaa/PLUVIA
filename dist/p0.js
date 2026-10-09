function pinTop() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}
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
  } else if (event.key === "Escape") closeCitySearch(true);
});
document.getElementById("cityResults")?.addEventListener("keydown", event => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); moveCityResult(event.key === "ArrowDown" ? 1 : -1); }
  else if (event.key === "Enter") { event.preventDefault(); chooseCity(event.target.closest("[data-id]")?.dataset.id); }
  else if (event.key === "Escape") closeCitySearch(true);
});
document.getElementById("cityResults")?.addEventListener("click", event => {
  const btn = event.target.closest("[data-id]");
  if (btn) chooseCity(btn.dataset.id);
});
(function bootCity() {
  const savedId = typeof readPreference === "function" ? readPreference("pluvia-city", null) : null;
  const fallback = cityById.get("1302603") || CITIES.find(city => city.uf === "AM");
  const saved = cityById.get(savedId);
  // A city page (/clima/<nome>-<uf>/) opens its own city, as an explicit choice.
  const pageCity = cityById.get(document.querySelector?.('meta[name="pluvia-city"]')?.content);
  let fallbackTimer;
  if (pageCity) chooseCity(pageCity.id);
  else if (saved) chooseCity(saved.id);
  else if (savedId) ensureMunicipalities().then(() => {
    if (!activeCity && cityById.has(savedId)) chooseCity(savedId);
  }).catch(() => {});
  else {
    if (typeof prefetchForecast === "function" && fallback) prefetchForecast(fallback);
    // index.html already shows this notice in the first paint when no city is
    // saved: inserting it above the painted skeleton 1.5s later shifted the whole
    // page. An account city that arrives first goes through chooseCity, which
    // hides it again.
    const notice = document.getElementById("locationNotice");
    const showNotice = () => {
      if (!notice) return;
      notice.hidden = false;
      notice.innerHTML = 'Mostrando Manaus como referência. <button type="button" id="noticeLocate">Usar minha localização</button> <button type="button" id="noticeChangeCity">Trocar cidade</button>';
      document.getElementById("noticeLocate")?.addEventListener("click", () => requestLocation('notice'));
      document.getElementById("noticeChangeCity")?.addEventListener("click", () => openCitySearch());
    };
    if (fallback) showNotice();
    else if (notice) notice.hidden = true;
    const pickFallback = () => {
      if (activeCity || !fallback) return;
      chooseCity(fallback.id);
      showNotice(); // chooseCity clears the notice of an explicit selection
      locationMessage("Manaus foi selecionada como referência. Use sua localização ou troque a cidade a qualquer momento.");
    };
    // The wait only lets a restored account apply its main city. Without a saved
    // Supabase session or an OAuth return in the URL nothing can arrive, so the
    // first visit gets its forecast without the fixed delay.
    let accountMayRestore = true;
    try {
      accountMayRestore = /[?&#](auth_return|code|access_token|error)=/.test(location.search + location.hash) ||
        Object.keys(localStorage).some(key => /^sb-.+-auth-token$/.test(key));
    } catch {}
    if (accountMayRestore) fallbackTimer = setTimeout(pickFallback, 1500);
    else pickFallback();
  }
  const welcome = document.getElementById("locationWelcome");
  if (welcome) welcome.hidden = true;
  pinTop();
  setTimeout(() => { clearTimeout(fallbackTimer); if (!activeCity && fallback) chooseCity(fallback.id); }, 1650);
})();
if ("serviceWorker" in navigator && window.isSecureContext) {
  let hadController = Boolean(navigator.serviceWorker.controller);
  let reloadingForUpdate = false;
  let pendingReload = false;
  const reloadWhenIdle = () => {
    if (!pendingReload || reloadingForUpdate || document.visibilityState === 'hidden' ||
      document.querySelector?.('dialog[open], input:focus, textarea:focus, [contenteditable]:focus')) return;
    reloadingForUpdate = true;
    location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) { hadController = true; return; }
    if (hadController && !reloadingForUpdate) {
      pendingReload = true;
      reloadWhenIdle();
    }
  });
  document.addEventListener('close', reloadWhenIdle, true);
  document.addEventListener('focusout', () => setTimeout(reloadWhenIdle,0));
  document.addEventListener('visibilitychange',reloadWhenIdle);
  let registration;
  let checking;
  let lastCheck = -Infinity;
  const checkForUpdate = () => {
    if (document.visibilityState === "hidden" || navigator.onLine === false || checking || Date.now() - lastCheck < 30000) return;
    lastCheck = Date.now();
    checking = (registration
      ? registration.update()
      : navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(value => {
        registration = value;
        return value.update();
      }))
      .catch(() => { lastCheck = -Infinity; })
      .finally(() => { checking = null; });
  };
  // Installed apps can resume an existing document without firing load again.
  window.addEventListener("pageshow", checkForUpdate);
  window.addEventListener("focus", checkForUpdate);
  window.addEventListener("online", checkForUpdate);
  document.addEventListener("visibilitychange", checkForUpdate);
  setInterval(checkForUpdate, 5 * 60 * 1000);
  checkForUpdate();
}

// The keyboard shrinks AND pans the visible area on iOS. Keep dialogs inside
// that area, rather than attaching their bottom edge to the layout viewport.
(function setupDialogViewport() {
  const viewport = window.visualViewport;
  let scheduled = false;
  const sync = () => {
    scheduled = false;
    const usableViewport = Number.isFinite(viewport?.height) && viewport.height > 0;
    const height = usableViewport ? viewport.height : window.innerHeight;
    const offsetTop = usableViewport ? viewport.offsetTop : 0;
    if (!Number.isFinite(height) || height <= 0) return;
    const style = document.documentElement.style;
    style.setProperty('--dialog-height', height + 'px');
    style.setProperty('--dialog-offset-top', Math.max(0, Number.isFinite(offsetTop) ? offsetTop : 0) + 'px');
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  };
  viewport?.addEventListener('resize', schedule, {passive:true});
  viewport?.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', schedule, {passive:true});
  window.addEventListener('orientationchange', schedule, {passive:true});
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  sync();
})();
