/* Páginas legais (/termos/, /privacidade/). Carregado no <head>, sem defer:
   1. tema claro de dia e escuro à noite, pelo Sol na cidade aberta no app (pluvia-city-record),
      ou em Manaus sem cidade salva; escrito antes do primeiro desenho, sem consulta de rede;
   2. X, marca e "Voltar para a previsão" (data-leave) voltam ao app pelo histórico quando ele está
      logo atrás (cidade e rolagem preservadas); aba nova tenta fechar e senão abre a previsão. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.mount(root.document);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (runtime) {
  'use strict';
  const MANAUS = {lat:-3.119, lon:-60.022};
  const RAD = Math.PI / 180;

  // Altura do Sol em graus (mesmas fórmulas do SunCalc, precisão de décimos de grau).
  function sunAltitude(at, lat, lon) {
    const d = at / 864e5 - 0.5 + 2440588 - 2451545;
    const M = RAD * (357.5291 + 0.98560028 * d);
    const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + RAD * 102.9372 + Math.PI, e = RAD * 23.4397;
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
    const H = RAD * (280.16 + 360.9856235 * d) + RAD * lon - ra, phi = RAD * lat;
    return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / RAD;
  }
  function place(storage) {
    try {
      const id = JSON.parse(storage?.getItem?.('pluvia-city') || 'null');
      const record = JSON.parse(storage?.getItem?.('pluvia-city-record') || 'null');
      if (record && record.id === id && Number.isFinite(record.lat) && Number.isFinite(record.lon) && Math.abs(record.lat) <= 90 && Math.abs(record.lon) <= 180) return {lat:record.lat, lon:record.lon};
    } catch (_) { /* storage bloqueado: cidade de referência */ }
    return MANAUS;
  }
  // Dia enquanto o Sol está acima do horizonte (−0,833°: refração e raio do disco, como o nascer/pôr).
  function theme(at, where) { return sunAltitude(at, where.lat, where.lon) > -0.833 ? 'day' : 'night'; }

  function fromApp(doc) {
    try { const ref = new URL(doc.referrer); return ref.origin === runtime.location.origin && !/^\/(termos|privacidade)\//.test(ref.pathname); } catch (_) { return false; }
  }
  function mount(doc) {
    if (!doc) return;
    const html = doc.documentElement;
    let storage = null;
    try { storage = runtime.localStorage; } catch (_) {}
    const paint = () => { html.dataset.theme = theme(Date.now(), place(storage)); };
    paint();
    doc.addEventListener('visibilitychange', () => { if (!doc.hidden) paint(); });
    const reduce = runtime.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    function leave(go) {
      if (reduce) { go(); return; }
      html.classList.add('leaving');
      runtime.setTimeout(go, 180);
    }
    doc.addEventListener('click', event => {
      const link = event.target?.closest?.('[data-leave]');
      if (!link || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const app = fromApp(doc);
      leave(() => {
        if (app && runtime.history.length > 1) { runtime.history.back(); return; }
        if (app) { runtime.close(); runtime.setTimeout(() => { runtime.location.href = link.href; }, 150); return; }
        runtime.location.href = link.href;
      });
    });
    // Voltou para cá pelo histórico (cache de página): sem o estado de saída.
    runtime.addEventListener('pageshow', () => { html.classList.remove('leaving'); paint(); });
  }
  return {sunAltitude, place, theme, mount};
});
