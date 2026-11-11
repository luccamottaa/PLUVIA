/* DEMO (não vai para produção): céu de desenho. Nuvens arredondadas, Sol, Lua, estrelas, chuva, raio,
   neve e neblina em SVG chapado, que entram pelos lados ou por cima ao abrir e ao trocar de cidade e
   depois ficam quase paradas (só um balanço lento, em transform). Liga com PLUVIA_DEMO.sky === "desenho". */
(function (root) {
  'use strict';
  var demo = root.PLUVIA_DEMO;
  if (!demo || demo.sky !== 'desenho') return;
  var doc = root.document, html = doc.documentElement, NS = 'http://www.w3.org/2000/svg';
  var reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // Lugares das nuvens (vw/vh do canto de cima à esquerda, largura em vw) e de onde cada uma entra.
  // As nuvens espiam pelas bordas (a maior parte fica fora da tela) para não cobrir o texto do topo.
  var SLOTS = [
    {x:-36, y:7,   w:60, from:'left'},
    {x:76,  y:3,   w:62, from:'right'},
    {x:21,  y:-11, w:58, from:'top'},
    {x:-38, y:30,  w:54, from:'left'},
    {x:80,  y:27,  w:54, from:'right'},
    {x:-30, y:52,  w:46, from:'left'},
    {x:82,  y:50,  w:46, from:'right'}
  ];
  var STARS = [[12,9],[30,17],[52,7],[74,14],[88,26],[8,34],[42,30],[66,38],[22,48],[82,52],[55,56],[14,62]];

  function palette(weather, night) {
    if (weather === 'storm') return night ? ['#4a536b', '#353d52'] : ['#7d8798', '#5d677a'];
    if (weather === 'rain') return night ? ['#56607d', '#3f4862'] : ['#b4bfce', '#94a1b3'];
    if (weather === 'cloud' || weather === 'snow') return night ? ['#5c688c', '#454f72'] : ['#f1f4f9', '#cfd8e4'];
    return night ? ['#5a6894', '#434f7a'] : ['#ffffff', '#dbe6f5'];
  }
  function plan(attrs) {
    var weather = attrs.weather || 'unknown', night = attrs.phase === 'night';
    var clouds = {sun:1, partly:attrs.clouds === 'few' ? 2 : 4, cloud:7, rain:6, storm:7, snow:6, fog:3}[weather] || 0;
    var drops = weather === 'storm' ? 20 : weather === 'rain' ? ({light:9, moderate:15, heavy:22}[attrs.rain] || 12) : 0;
    return {
      weather:weather, night:night, clouds:clouds, drops:drops,
      flakes:weather === 'snow' ? 16 : 0,
      sun:!night && (weather === 'sun' || weather === 'partly'),
      moon:night && (weather === 'sun' || weather === 'partly'),
      stars:night && (weather === 'sun' || weather === 'partly') ? STARS.length : 0,
      bolt:weather === 'storm', fog:weather === 'fog',
      key:[weather, night ? 'n' : 'd', attrs.rain || '', attrs.clouds || ''].join('|')
    };
  }

  function svg(viewBox, inner) {
    var el = doc.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', viewBox); el.setAttribute('focusable', 'false'); el.innerHTML = inner;
    return el;
  }
  // Nuvem de desenho: três bolas sobre uma base arredondada; a mesma forma mais escura por baixo dá o volume.
  function cloudShape(fill) {
    return '<g fill="' + fill + '"><circle cx="62" cy="72" r="38"/><circle cx="112" cy="54" r="48"/><circle cx="160" cy="76" r="34"/>' +
      '<rect x="24" y="72" width="170" height="40" rx="20"/></g>';
  }
  function cloud(colors) {
    return svg('0 0 218 124', '<g transform="translate(0 10)">' + cloudShape(colors[1]) + '</g>' + cloudShape(colors[0]));
  }
  function sun() {
    var rays = '';
    for (var i = 0; i < 8; i++) rays += '<rect x="96" y="6" width="8" height="26" rx="4" transform="rotate(' + (i * 45) + ' 100 100)"/>';
    return svg('0 0 200 200', '<g fill="#ffb703" class="toon-rays">' + rays + '</g><circle cx="100" cy="100" r="52" fill="#ffd23f"/><circle cx="100" cy="100" r="52" fill="none" stroke="#ffb703" stroke-width="6"/>');
  }
  function moon() {
    return svg('0 0 200 200', '<path fill="#f6f1d5" d="M128 28a78 78 0 1 0 44 124a62 62 0 1 1-44-124Z"/>');
  }
  function star() { return svg('0 0 24 24', '<path fill="#fff6c9" d="M12 1c1.2 6.2 4.8 9.8 11 11c-6.2 1.2-9.800 4.800-11 11c-1.200-6.200-4.800-9.800-11-11c6.200-1.200 9.800-4.800 11-11Z"/>'); }
  function bolt() { return svg('0 0 60 110', '<path fill="#ffd23f" stroke="#ffb703" stroke-width="3" stroke-linejoin="round" d="M36 3 8 58h18l-8 49 34-62H33L36 3Z"/>'); }

  function style() {
    var el = doc.createElement('style');
    el.textContent =
      'html[data-demo-sky="desenho"] .sky-effects > :not(.toon-sky){display:none!important}' +
      '.toon-sky{position:absolute;inset:0;z-index:2;overflow:hidden;pointer-events:none}' +
      '.toon{position:absolute;will-change:transform}.toon svg{display:block;width:100%;height:auto;overflow:visible}' +
      '.toon-bob{animation:toon-bob var(--bob,9s) ease-in-out infinite alternate;animation-delay:var(--bob-delay,0s)}' +
      '@keyframes toon-bob{from{transform:translate3d(0,-5px,0)}to{transform:translate3d(6px,5px,0)}}' +
      '.toon-rays{transform-origin:100px 100px;animation:toon-spin 40s linear infinite}@keyframes toon-spin{to{transform:rotate(360deg)}}' +
      '.toon-drop{position:absolute;top:-6vh;width:5px;height:16px;border-radius:5px;background:#8fd0ff;transform:rotate(12deg);animation:toon-fall var(--fall,1.1s) linear infinite;animation-delay:var(--fall-delay,0s)}' +
      '@keyframes toon-fall{to{transform:translate3d(-18vh,112vh,0) rotate(12deg)}}' +
      '.toon-flake{position:absolute;top:-4vh;width:9px;height:9px;border-radius:50%;background:#fff;animation:toon-snow var(--fall,7s) linear infinite;animation-delay:var(--fall-delay,0s)}' +
      '@keyframes toon-snow{50%{transform:translate3d(3vw,55vh,0)}to{transform:translate3d(-2vw,110vh,0)}}' +
      '.toon-bolt svg{animation:toon-flash 7s linear infinite}@keyframes toon-flash{0%,88%,100%{opacity:0}89%,91%{opacity:1}90%{opacity:.3}93%{opacity:.9}96%{opacity:0}}' +
      '.toon-fog{position:absolute;height:9vh;border-radius:9vh;background:#ffffff8c}' +
      '.sky-effects[data-motion="paused"] .toon-sky *{animation-play-state:paused!important}' +
      '@media (prefers-reduced-motion:reduce){.toon-sky *{animation:none!important}}';
    doc.head.appendChild(style_ = el);
  }
  var style_ = null, layer = null, current = '', cityPending = true, timer = 0;

  function place(el, x, y, w) {
    el.style.left = x + 'vw'; el.style.top = y + 'vh';
    if (w) el.style.width = 'min(' + w + 'vw,' + (w * 6) + 'px)';
  }
  function offset(from) { return from === 'left' ? 'translate3d(-120vw,0,0)' : from === 'right' ? 'translate3d(120vw,0,0)' : from === 'top' ? 'translate3d(0,-70vh,0)' : 'scale(0)'; }
  function enter(el, from, index) {
    el.dataset.from = from;
    if (reduced || !el.animate) return;
    el.animate([{transform:offset(from)}, {transform:'none'}], {duration:from === 'pop' ? 520 : 950, delay:120 + index * 85, easing:'cubic-bezier(.2,.9,.25,1.12)', fill:'backwards'});
  }
  function leave(old) {
    if (!old) return;
    if (reduced) { old.remove(); return; }
    var nodes = old.querySelectorAll('.toon'), longest = 0;
    Array.prototype.forEach.call(nodes, function (el, index) {
      var delay = index * 25; longest = Math.max(longest, delay + 380);
      if (el.animate) el.animate([{transform:'none'}, {transform:offset(el.dataset.from === 'pop' ? 'pop' : el.dataset.from)}], {duration:380, delay:delay, easing:'cubic-bezier(.5,0,.9,.4)', fill:'forwards'});
    });
    old.querySelectorAll('.toon-fx').forEach(function (el) { el.remove(); });
    root.setTimeout(function () { old.remove(); }, longest + 40);
  }
  function wrap(node, className) {
    var el = doc.createElement('div'), bob = doc.createElement('div');
    el.className = 'toon ' + (className || ''); bob.className = 'toon-bob'; bob.appendChild(node); el.appendChild(bob);
    return el;
  }
  function build(p) {
    var box = doc.createElement('div'), index = 0, i;
    box.className = 'toon-sky';
    if (p.sun || p.moon) {
      var orb = wrap(p.sun ? sun() : moon(), 'toon-orb');
      place(orb, p.sun ? 66 : 74, p.sun ? -4 : 17, p.sun ? 42 : 22); box.appendChild(orb); enter(orb, 'top', index++);
    }
    for (i = 0; i < p.stars; i++) {
      var s = wrap(star(), 'toon-star'); s.firstChild.className = '';
      place(s, STARS[i][0], STARS[i][1], i % 3 ? 3 : 4.5); box.appendChild(s); enter(s, 'pop', index++);
    }
    if (p.fog) for (i = 0; i < 4; i++) {
      var f = doc.createElement('div'); f.className = 'toon toon-fog';
      f.style.left = (i % 2 ? 18 : -22) + 'vw'; f.style.top = (12 + i * 13) + 'vh'; f.style.width = '104vw';
      box.appendChild(f); enter(f, i % 2 ? 'right' : 'left', index++);
    }
    var colors = palette(p.weather, p.night);
    for (i = 0; i < p.clouds; i++) {
      var slot = SLOTS[i % SLOTS.length], c = wrap(cloud(colors), 'toon-cloud');
      c.firstChild.style.setProperty('--bob', (8 + (i * 1.7) % 5) + 's'); c.firstChild.style.setProperty('--bob-delay', (-i * 1.3) + 's');
      place(c, slot.x, slot.y, slot.w); box.appendChild(c); enter(c, slot.from, index++);
    }
    if (p.bolt) {
      var b = doc.createElement('div'); b.className = 'toon toon-bolt'; b.appendChild(bolt());
      place(b, 40, 20, 18); box.appendChild(b); enter(b, 'pop', index++);
    }
    // Chuva e neve começam depois que as nuvens chegam.
    var fx = doc.createElement('div'); fx.className = 'toon-fx';
    for (i = 0; i < p.drops; i++) {
      var d = doc.createElement('i'); d.className = 'toon-drop';
      d.style.left = (4 + (i * 97 / Math.max(p.drops, 1)) % 108) + 'vw';
      d.style.setProperty('--fall', (.85 + (i * 7 % 5) * .09) + 's'); d.style.setProperty('--fall-delay', (-(i * 13 % 10) / 10) + 's');
      if (p.night) d.style.background = '#6fa8dc';
      fx.appendChild(d);
    }
    for (i = 0; i < p.flakes; i++) {
      var k = doc.createElement('i'); k.className = 'toon-flake';
      k.style.left = (3 + (i * 61) % 96) + 'vw';
      k.style.setProperty('--fall', (6 + i % 4) + 's'); k.style.setProperty('--fall-delay', (-(i * 0.7)) + 's');
      fx.appendChild(k);
    }
    if (fx.childNodes.length) {
      if (!reduced && fx.animate) fx.animate([{opacity:0}, {opacity:1}], {duration:500, delay:700, fill:'backwards'});
      box.appendChild(fx);
    }
    return box;
  }
  function render() {
    var host = doc.querySelector('.sky-effects'); if (!host) return;
    var p = plan({weather:html.dataset.weather, phase:html.dataset.phase, rain:html.dataset.rain, clouds:html.dataset.clouds});
    if (p.weather === 'unknown' && !current) return;         // espera a primeira previsão
    if (p.key === current && !cityPending) return;           // mesma cena, mesma cidade: nada a refazer
    if (!style_) style();
    var old = layer; layer = build(p); current = p.key; cityPending = false;
    leave(old); host.appendChild(layer);
  }
  function soon(ms) { root.clearTimeout(timer); timer = root.setTimeout(render, ms); }

  root.addEventListener('pluvia:city-changed', function () { cityPending = true; soon(2500); });
  root.addEventListener('pluvia:weather-updated', function () { soon(120); });
  new root.MutationObserver(function () { soon(250); }).observe(html, {attributes:true, attributeFilter:['data-weather', 'data-phase', 'data-rain', 'data-clouds']});
  function first() { if (!style_) style(); soon(300); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', first, {once:true}); else first();
  root.PLUVIA_DEMO.toon = {plan:plan, replay:function () { cityPending = true; render(); }};
})(globalThis);
