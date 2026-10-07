/* Atalhos do PWA (manifest "shortcuts"): /?abrir=cidades|comparar|radar.
   Remove o parâmetro do endereço na hora, para um reload não reabrir o diálogo, e só age
   depois da intro e da primeira previsão. Sem o parâmetro, não faz nada. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).shortcuts = api;
  if (root.document && root.location) api.run(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const ACTIONS = ['cidades', 'comparar', 'radar'];
  const WAIT_MS = 15000;

  // Ação pedida e o endereço sem o parâmetro (os demais parâmetros e o hash continuam).
  function parse(href) {
    let url;
    try { url = new URL(href); } catch { return {action:null, clean:null}; }
    if (!url.searchParams.has('abrir')) return {action:null, clean:null};
    const action = url.searchParams.get('abrir');
    url.searchParams.delete('abrir');
    return {action:ACTIONS.includes(action) ? action : null, clean:url.pathname + url.search + url.hash};
  }

  function run(root) {
    const {action, clean} = parse(root.location.href);
    if (clean === null) return;
    try { root.history.replaceState(root.history.state, '', clean); } catch {}
    if (!action) return;
    const doc = root.document, el = id => doc.getElementById(id);
    let done = false, timer = 0, observer = null;
    const ready = () => {
      const intro = el('pluviaIntro');
      const shown = typeof displayedWeather !== 'undefined' && displayedWeather;
      return (!intro || intro.hidden) && Boolean(shown);
    };
    function act() {
      if (done) return;
      done = true; root.clearTimeout(timer); observer?.disconnect();
      root.removeEventListener('pluvia:weather-updated', check);
      if (action === 'cidades' && typeof openCitySearch === 'function') openCitySearch();
      else if (action === 'comparar') root.PLUVIA?.compare?.open?.();
      else if (action === 'radar') el('expandRadar')?.click();
    }
    function check() { if (ready()) act(); }
    root.addEventListener('pluvia:weather-updated', check);
    // A intro some por atributo; observar evita timer de polling.
    const intro = el('pluviaIntro');
    if (intro && root.MutationObserver) {
      observer = new root.MutationObserver(check);
      observer.observe(intro, {attributes:true, attributeFilter:['hidden']});
    }
    // Sem previsão (offline, falha), abre mesmo assim: cada diálogo já trata a ausência de dados.
    timer = root.setTimeout(act, WAIT_MS);
    check();
  }

  return {parse, run, ACTIONS, WAIT_MS};
});
