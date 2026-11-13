// "Usar minha localização exata" (1.74, pedido do dono). Desligada por padrão. Ligada, a previsão, o radar e a
// estação mais próxima usam um ponto perto da pessoa em vez do centro do município. O ponto é arredondado para
// duas casas decimais (~1,1 km), nunca o endereço, e fica guardado só neste aparelho (pluvia-exact-point).
// Com avisos ligados, o mesmo ponto vai para o servidor como "Minha localização" quando muda de cidade ou anda
// mais de 2 km (notifications.js); desligar a opção apaga o ponto daqui e de lá.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.PLUVIA = root.PLUVIA || {}; root.PLUVIA.exactLocation = api; }
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const ON_KEY = "pluvia-exact-location", POINT_KEY = "pluvia-exact-point", SYNCED_KEY = "pluvia-exact-point-synced";
  // Um ponto vale por 24 h: depois disso a cidade volta ao centro até a próxima leitura da localização.
  const MAX_AGE_MS = 24 * 3600000, SYNC_KM = 2;
  const storage = () => { try { return root.localStorage || null; } catch { return null; } };
  const read = key => { try { return JSON.parse(storage()?.getItem(key) || "null"); } catch { return null; } };
  const write = (key, value) => { try { value == null ? storage()?.removeItem(key) : storage()?.setItem(key, typeof value === "string" ? value : JSON.stringify(value)); } catch {} };

  const round = value => Math.round(Number(value) * 100) / 100;
  const validPoint = point => point && /^\d{7}$/.test(String(point.id)) && Number.isFinite(point.lat) && Number.isFinite(point.lon)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180 && Number.isFinite(point.at);

  function distanceKm(a, b) {
    const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function enabled() { try { return storage()?.getItem(ON_KEY) === "1"; } catch { return false; } }
  function setEnabled(on) {
    write(ON_KEY, on ? "1" : null);
    if (!on) write(POINT_KEY, null);
    root.dispatchEvent?.(new root.CustomEvent("pluvia:exact-location-changed", {detail:{on:Boolean(on)}}));
  }

  // Guarda o ponto arredondado de uma leitura da localização (cidade = município mais próximo).
  function remember(cityId, latitude, longitude, now = Date.now()) {
    const point = {id:String(cityId), lat:round(latitude), lon:round(longitude), at:now};
    if (!validPoint(point)) return null;
    write(POINT_KEY, point);
    return point;
  }
  // O ponto guardado, se é desta cidade e tem menos de 24 h.
  function pointFor(cityId, now = Date.now()) {
    const point = read(POINT_KEY);
    if (!validPoint(point) || point.id !== String(cityId)) return null;
    const age = now - point.at;
    return age >= -60000 && age <= MAX_AGE_MS ? point : null;
  }
  // A cidade com o ponto no lugar das coordenadas: tudo que lê city.lat/lon (previsão, radar, estação, céu) passa
  // a olhar o ponto. ref guarda o centro do município para o que precisa dele (registro da cidade, avisos da cidade).
  function apply(city, point) {
    if (!city || !point || String(city.id) !== point.id) return city;
    const ref = city.ref || {lat:city.lat, lon:city.lon};
    return {...city, lat:point.lat, lon:point.lon, ref, exact:true};
  }
  function reference(city) { return city?.ref || (city ? {lat:city.lat, lon:city.lon} : null); }

  // O servidor só recebe o ponto de novo quando a cidade muda ou a pessoa andou mais de 2 km.
  function needsSync(point, synced = read(SYNCED_KEY)) {
    if (!validPoint(point)) return false;
    if (!synced || synced.id !== point.id || !Number.isFinite(synced.lat) || !Number.isFinite(synced.lon)) return true;
    return distanceKm(synced, point) > SYNC_KM;
  }
  function markSynced(point) { write(SYNCED_KEY, point ? {id:point.id, lat:point.lat, lon:point.lon} : null); }
  function synced() { return read(SYNCED_KEY); }

  // Linha "Usar minha localização exata" em Mais do PLUVIA.
  function wire(doc) {
    const button = doc?.getElementById?.("exactLocation"), state = doc?.getElementById?.("exactLocationState");
    if (!button) return;
    const paint = () => { const on = enabled(); button.setAttribute("aria-pressed", String(on)); if (state) state.textContent = on ? "Ligado" : "Desligado"; };
    button.addEventListener("click", () => { setEnabled(!enabled()); paint(); });
    root.addEventListener?.("pluvia:exact-location-changed", paint);
    paint();
  }
  if (root.document) {
    const start = () => wire(root.document);
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, {once:true}); else start();
  }

  return {ON_KEY, POINT_KEY, SYNCED_KEY, MAX_AGE_MS, SYNC_KM, round, distanceKm, enabled, setEnabled, remember, pointFor, apply, reference, needsSync, markSynced, synced};
});
