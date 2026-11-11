/* DEMO (não vai para produção): barra para comparar no aparelho o peso do céu e do vidro.
   Céu: "atual" (como está), "lento" (nuvem 3D a 8 quadros/s, uma animação de estrela a menos),
   "2d" (sem shader 3D: as camadas de nuvem do CSS deslizam) e "descansa" (anima 8 s ao abrir,
   ao trocar de cidade e ao voltar para o app; depois para). Vidro: com ou sem backdrop-filter.
   A escolha fica no localStorage e a página recarrega, para cada modo começar limpo. */
(function (root) {
  'use strict';
  var SKY_KEY = 'pluvia-demo-sky', GLASS_KEY = 'pluvia-demo-glass', AWAKE_MS = 8000;
  var SKIES = [['atual', 'Atual'], ['lento', '1 · 3D lento'], ['2d', '2 · 2D'], ['descansa', '3 · Descansa']];
  function read(key, fallback, allowed) {
    try { var value = root.localStorage.getItem(key); return allowed.indexOf(value) >= 0 ? value : fallback; } catch (_) { return fallback; }
  }
  var demo = root.PLUVIA_DEMO = {
    sky: read(SKY_KEY, 'atual', SKIES.map(function (item) { return item[0]; })),
    glass: read(GLASS_KEY, 'on', ['on', 'off']),
    awake: true,
    frameMs: 125
  };
  var html = root.document.documentElement;
  html.setAttribute('data-demo-sky', demo.sky);
  html.setAttribute('data-demo-glass', demo.glass);

  // Modo 3: acorda nos eventos e descansa depois de AWAKE_MS.
  var timer = 0;
  function wake() {
    if (demo.sky !== 'descansa') return;
    demo.awake = true; root.PLUVIA && root.PLUVIA.skyMotion && root.PLUVIA.skyMotion.sync();
    root.clearTimeout(timer);
    timer = root.setTimeout(function () { demo.awake = false; root.PLUVIA && root.PLUVIA.skyMotion && root.PLUVIA.skyMotion.sync(); }, AWAKE_MS);
  }
  root.addEventListener('pluvia:weather-updated', wake);
  root.addEventListener('pageshow', wake);
  root.document.addEventListener('visibilitychange', function () { if (!root.document.hidden) wake(); });

  function choose(key, value) {
    try { root.localStorage.setItem(key, value); } catch (_) {}
    root.location.reload();
  }
  function build() {
    var doc = root.document, bar = doc.createElement('div');
    bar.className = 'demo-bar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Demonstração: céu e vidro');
    var style = doc.createElement('style');
    style.textContent =
      '.demo-bar{position:fixed;left:8px;right:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:2147483000;display:grid;gap:6px;padding:8px;border-radius:16px;background:#0b1224;color:#fff;font:600 13px/1.2 system-ui,sans-serif;box-shadow:0 6px 24px #0008}' +
      '.demo-bar[data-min] .demo-row{display:none}' +
      '.demo-row{display:flex;gap:6px;align-items:center}.demo-row>span{flex:none;width:42px;opacity:.7}' +
      '.demo-bar button{flex:1;min-height:40px;padding:0 4px;border:1px solid #ffffff33;border-radius:10px;background:none;color:inherit;font:inherit}' +
      '.demo-bar button[aria-pressed="true"]{background:#7fbfff;border-color:#7fbfff;color:#06122b}' +
      '.demo-bar .demo-min{flex:none;width:100%;min-height:28px;border:0;opacity:.8}' +
      'html[data-demo-glass="off"] *,html[data-demo-glass="off"] *::before,html[data-demo-glass="off"] *::after{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}' +
      'html:is([data-demo-sky="lento"],[data-demo-sky="2d"]) .sky-stars::before{animation:none!important;opacity:.5}';
    doc.head.appendChild(style);
    function row(label, items, current, key) {
      var line = doc.createElement('div'), name = doc.createElement('span');
      line.className = 'demo-row'; name.textContent = label; line.appendChild(name);
      items.forEach(function (item) {
        var button = doc.createElement('button');
        button.type = 'button'; button.textContent = item[1]; button.setAttribute('aria-pressed', String(item[0] === current));
        button.addEventListener('click', function () { if (item[0] !== current) choose(key, item[0]); });
        line.appendChild(button);
      });
      return line;
    }
    var min = doc.createElement('button');
    min.type = 'button'; min.className = 'demo-min';
    function label() { min.textContent = bar.hasAttribute('data-min') ? 'Demo ▲ (' + demo.sky + ', vidro ' + demo.glass + ')' : 'Esconder ▼'; }
    min.addEventListener('click', function () { bar.toggleAttribute('data-min'); label(); });
    bar.appendChild(row('Céu', SKIES, demo.sky, SKY_KEY));
    bar.appendChild(row('Vidro', [['on', 'Com vidro'], ['off', 'Sem vidro']], demo.glass, GLASS_KEY));
    bar.appendChild(min); label();
    doc.body.appendChild(bar);
    wake();
  }
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', build, { once: true }); else build();
})(globalThis);
