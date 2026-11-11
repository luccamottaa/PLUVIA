/* Céu de desenho (1.70, pedido do dono: "nuvens tipo desenho, arredondadas, de todas as condições, que
   aparecem quando abre e quando troca de cidade"). Substitui as camadas animadas do céu antigo (nuvens 3D,
   nuvens em imagem, estrelas cintilando, chuva em SVG, raio, estrela cadente, arco-íris); o degradê do
   céu, o crepúsculo e a tinta do texto continuam de sky-atmosphere.js. Lê os mesmos atributos da raiz
   (data-phase, -solar, -weather, -clouds, -rain, -wind, -rainbow) e as órbitas do Sol e da Lua.

   Desenho: nuvem no traço dos ícones dos 7 dias (scripts/generate-line-icons.py, classe Cloud), com cinco
   círculos em vez de três, preenchida, contorno arredondado e sombra macia embaixo. Sol com raios, Lua na
   fase real (PLUVIA.moon), estrelas de quatro pontas, chuva e neve como UMA camada que desliza (não um
   elemento por gota), raio que pisca, neblina em faixas e arco-íris.

   Movimento: os elementos entram pelos lados, por cima ou surgem no lugar (os do meio, para não atravessar
   o texto) ao abrir, ao trocar de cidade e quando o céu muda; os da cena anterior saem pelo mesmo lado.
   Depois só as nuvens balançam devagar (transform), os raios do Sol giram e a chuva cai. Nada de
   will-change. Cena parada (data-motion="paused": página oculta, intro na frente) pausa tudo; movimento
   reduzido não anima nada.

   O céu antigo continua no código: localStorage "pluvia-sky-style" = "classic" volta a ele (o script do
   <head> põe data-sky="classic"; sem isso, data-sky="toon"). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    (root.PLUVIA = root.PLUVIA || {}).skyToon = api;
    if (root.document) api.mount(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';

  // Lugares das nuvens: x/y em vw/vh do canto de cima à esquerda, w = largura em vw. As das bordas entram
  // pelo lado ou por cima; as do meio (mid) são menores, surgem no lugar e ficam translúcidas.
  const SLOTS = [
    {x:-30, y:7,   w:58, from:'left'},
    {x:54,  y:31,  w:38, from:'pop', mid:true},
    {x:72,  y:3,   w:60, from:'right'},
    {x:8,   y:14,  w:34, from:'pop', mid:true},
    {x:22,  y:-9,  w:54, from:'top'},
    {x:-34, y:30,  w:54, from:'left'},
    {x:28,  y:55,  w:42, from:'pop', mid:true},
    {x:80,  y:27,  w:52, from:'right'},
    {x:-28, y:52,  w:46, from:'left'},
    {x:82,  y:50,  w:46, from:'right'}
  ];
  const STARS = [[12, 9], [30, 17], [52, 7], [74, 14], [88, 26], [8, 34], [42, 30], [66, 38], [22, 48], [82, 52], [55, 56], [14, 62]];
  const WEATHERS = ['sun', 'partly', 'cloud', 'rain', 'storm', 'snow', 'fog', 'unknown'];
  const CLOUDS = {sun:1, partly:5, few:3, cloud:9, rain:8, storm:9, snow:7, fog:3, unknown:0};
  const RAIN = {light:{speed:1.25, dense:false}, moderate:{speed:.95, dense:true}, heavy:{speed:.7, dense:true}};

  // Cores das nuvens [preenchimento, sombra/contorno] por condição, de dia e de noite; nascer e pôr do sol
  // tingem as nuvens claras de rosa.
  const PALETTE = {
    day:   {sun:['#ffffff', '#d6e3f4'], partly:['#ffffff', '#d6e3f4'], cloud:['#e8edf4', '#c1ccda'], rain:['#a9b5c5', '#8492a6'],
            storm:['#76829a', '#58647a'], snow:['#f5f8fc', '#d2dbe7'], fog:['#eef2f6', '#d4dbe4'], unknown:['#ffffff', '#d6e3f4']},
    night: {sun:['#59658f', '#414c76'], partly:['#59658f', '#414c76'], cloud:['#4e597b', '#394262'], rain:['#46506f', '#323a56'],
            storm:['#3a4360', '#283047'], snow:['#6f7aa0', '#555e84'], fog:['#5d6788', '#465072'], unknown:['#59658f', '#414c76']},
    dusk:  ['#ffe2d4', '#f0b4a2']
  };

  function plan(attrs = {}) {
    const weather = WEATHERS.includes(attrs.weather) ? attrs.weather : 'unknown';
    const night = attrs.phase === 'night';
    const clear = weather === 'sun' || weather === 'partly';
    const dusk = !night && (attrs.solar === 'sunrise' || attrs.solar === 'sunset');
    const clouds = weather === 'partly' && attrs.clouds === 'few' ? CLOUDS.few : CLOUDS[weather];
    const rain = weather === 'storm' ? (RAIN[attrs.rain] ? attrs.rain : 'moderate') : weather === 'rain' ? (RAIN[attrs.rain] ? attrs.rain : 'light') : null;
    let colors = PALETTE[night ? 'night' : 'day'][weather];
    if (dusk && clear) colors = PALETTE.dusk;
    return {
      weather, night, clouds, colors, rain, windy:Boolean(rain) && attrs.wind === 'strong',
      sun:!night && (clear || weather === 'unknown'),
      moon:night && (clear || weather === 'cloud'),
      stars:night && clear ? STARS.length : 0,
      snow:weather === 'snow', bolt:weather === 'storm', fog:weather === 'fog',
      rainbow:attrs.rainbow === 'on' && !night,
      key:[weather, night ? 'n' : 'd', dusk ? 'dusk' : '', attrs.clouds || '', rain || '', attrs.wind === 'strong' ? 'w' : '', attrs.rainbow === 'on' ? 'rb' : ''].join('|')
    };
  }

  // Nuvem: círculos unidos num contorno só, com base reta tangente aos de fora (o mesmo princípio de
  // generate-line-icons.py). Cinco círculos [dx, altura do centro, raio] em unidades de 20 px.
  const BUMPS = [[-6.2, 2.6, 2.6], [-3.2, 4.6, 3.6], [.6, 5.6, 4.6], [4.4, 4.2, 3.6], [7, 2.8, 2.8]];
  function cloudPath(bumps = BUMPS, scale = 20, cx = 185, base = 208) {
    const c = bumps.map(([dx, h, r]) => [cx + dx * scale, base - h * scale, r * scale]);
    const meet = (a, b) => { // interseção de cima entre dois círculos vizinhos
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]), t = (a[2] * a[2] - b[2] * b[2] + d * d) / (2 * d), h = Math.sqrt(Math.max(a[2] * a[2] - t * t, 0));
      const mx = a[0] + t * (b[0] - a[0]) / d, my = a[1] + t * (b[1] - a[1]) / d;
      const p = [mx + h * (b[1] - a[1]) / d, my - h * (b[0] - a[0]) / d], q = [mx - h * (b[1] - a[1]) / d, my + h * (b[0] - a[0]) / d];
      return p[1] < q[1] ? p : q;
    };
    const arc = (k, from, to) => {
      const ang = pt => Math.atan2(pt[1] - k[1], pt[0] - k[0]);
      const turn = (ang(to) - ang(from) + 4 * Math.PI) % (2 * Math.PI);
      return `A${+k[2].toFixed(1)} ${+k[2].toFixed(1)} 0 ${turn > Math.PI ? 1 : 0} 1 ${to[0].toFixed(1)} ${to[1].toFixed(1)}`;
    };
    let from = [c[0][0], base], d = `M${from[0].toFixed(1)} ${base}`;
    c.forEach((k, i) => { const to = i < c.length - 1 ? meet(k, c[i + 1]) : [k[0], base]; d += arc(k, from, to); from = to; });
    return d + 'Z';
  }
  const CLOUD = cloudPath();

  // Parte iluminada da Lua (fase 0 = nova, .5 = cheia), norte para cima, crescente iluminada à direita,
  // num disco de raio 34 centrado em (40, 40): a mesma projeção de moon-view.js.
  function moonPath(phase) {
    if (!Number.isFinite(phase)) return '';
    const p = ((phase % 1) + 1) % 1;
    if (p < .02 || p > .98) return '';
    const waxing = p < .5, terminator = (waxing ? 1 : -1) * Math.cos(p * Math.PI * 2), r = 34, w = Math.abs(terminator) * r;
    const limb = `M40 6 A${r} ${r} 0 0 ${waxing ? 1 : 0} 40 74`;
    return `${limb} ${w < .0001 ? 'L40 6' : `A${w.toFixed(3)} ${r} 0 0 ${terminator > 0 ? 0 : 1} 40 6`}Z`;
  }

  // Ladrilhos da chuva e da neve (uma camada que desliza; a altura do ladrilho é o passo da animação).
  function rainTile(dense, night) {
    const color = night ? '#7fb0e6' : '#5aa6f0';
    const drops = dense ? [[14, 10], [52, 46], [88, 18], [30, 92], [72, 120], [104, 80], [8, 136], [60, 2]] : [[18, 14], [70, 60], [40, 112], [100, 128]];
    const marks = drops.map(([x, y]) => `<rect x='${x}' y='${y}' width='5' height='17' rx='2.5' fill='${color}'/>`).join('');
    return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160'>${marks}</svg>`)}")`;
  }
  function snowTile() {
    const flakes = [[16, 12, 4.5], [70, 40, 3.5], [40, 88, 5], [100, 110, 4], [12, 140, 3.5], [84, 150, 4.5]];
    const marks = flakes.map(([x, y, r]) => `<circle cx='${x}' cy='${y}' r='${r}' fill='white'/>`).join('');
    return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='160'>${marks}</svg>`)}")`;
  }

  function mount(win) {
    const doc = win.document, html = doc.documentElement;
    if (html.dataset.sky === 'classic') return;
    const reduced = () => Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    let layer = null, current = '', cityPending = true, timer = 0, ids = 0;

    function svg(viewBox, inner) {
      const el = doc.createElementNS(NS, 'svg');
      el.setAttribute('viewBox', viewBox); el.setAttribute('focusable', 'false'); el.setAttribute('aria-hidden', 'true');
      el.innerHTML = inner;
      return el;
    }
    function cloud(colors) {
      const id = 'toonCloud' + (++ids);
      return svg('0 0 390 216',
        `<clipPath id="${id}"><path d="${CLOUD}"/></clipPath>` +
        `<path d="${CLOUD}" fill="${colors[0]}"/>` +
        `<ellipse cx="195" cy="228" rx="205" ry="58" fill="${colors[1]}" opacity=".7" clip-path="url(#${id})"/>` +
        `<path d="${CLOUD}" fill="none" stroke="${colors[1]}" stroke-width="5" stroke-linejoin="round"/>`);
    }
    function sun(dusk) {
      let rays = '';
      for (let i = 0; i < 8; i++) rays += `<rect x="96" y="8" width="8" height="24" rx="4" transform="rotate(${i * 45} 100 100)"/>`;
      return svg('0 0 200 200', `<g class="toon-rays" fill="${dusk ? '#ff9f4a' : '#ffb703'}">${rays}</g>` +
        `<circle cx="100" cy="100" r="52" fill="${dusk ? '#ffc46b' : '#ffd23f'}"/><circle cx="100" cy="100" r="52" fill="none" stroke="${dusk ? '#ff9f4a' : '#ffb703'}" stroke-width="6"/>`);
    }
    function moon() {
      let phase = NaN;
      try { phase = win.PLUVIA?.moon?.getMoonIllumination?.(new Date())?.phase; } catch (_) {}
      const lit = moonPath(phase);
      return svg('0 0 80 80', `<circle cx="40" cy="40" r="34" fill="#f6f1d5" opacity=".16"/>` +
        (lit ? `<path d="${lit}" fill="#f6f1d5"/>` : '') + `<circle cx="40" cy="40" r="34" fill="none" stroke="#f6f1d5" stroke-opacity=".35" stroke-width="2"/>`);
    }
    const star = () => svg('0 0 24 24', '<path fill="#fff6c9" d="M12 1c1.2 6.2 4.8 9.8 11 11c-6.2 1.2-9.8 4.8-11 11c-1.2-6.2-4.8-9.8-11-11c6.2-1.2 9.8-4.8 11-11Z"/>');
    const bolt = () => svg('0 0 60 110', '<path fill="#ffd23f" stroke="#ffb703" stroke-width="3" stroke-linejoin="round" d="M36 3 8 58h18l-8 49 34-62H33L36 3Z"/>');
    const rainbow = () => svg('0 0 200 110', ['#ff8f8f', '#ffc078', '#ffe58a', '#9ddca8', '#86c3f2', '#b4a8f5']
      .map((color, i) => `<path d="M${14 + i * 8} 104a${86 - i * 8} ${86 - i * 8} 0 0 1 ${172 - i * 16} 0" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"/>`).join(''));

    function piece(node, className, from) {
      const el = doc.createElement('div'), bob = doc.createElement('div');
      el.className = 'toon ' + className; el.dataset.from = from;
      bob.className = 'toon-bob'; bob.append(node); el.append(bob);
      return el;
    }
    function place(el, x, y, w) {
      el.style.left = x + 'vw'; el.style.top = y + 'vh';
      if (w) el.style.width = `min(${w}vw, ${Math.round(w * 6)}px)`;
    }
    const offset = from => from === 'left' ? 'translate3d(-120vw,0,0)' : from === 'right' ? 'translate3d(120vw,0,0)'
      : from === 'top' ? 'translate3d(0,-70vh,0)' : 'scale(0)';
    function enter(el, index) {
      if (reduced() || !el.animate) return;
      const from = el.dataset.from;
      el.animate([{transform:offset(from), opacity:from === 'pop' ? 0 : 1}, {transform:'none', opacity:1}],
        {duration:from === 'pop' ? 560 : 950, delay:120 + index * 80, easing:'cubic-bezier(.2,.9,.25,1.12)', fill:'backwards'});
    }
    function leave(old) {
      if (!old) return;
      if (reduced()) { old.remove(); return; }
      let longest = 0;
      old.querySelectorAll('.toon-fx').forEach(el => el.remove());
      old.querySelectorAll('.toon').forEach((el, index) => {
        const delay = index * 22; longest = Math.max(longest, delay + 380);
        el.animate?.([{transform:'none', opacity:1}, {transform:offset(el.dataset.from), opacity:el.dataset.from === 'pop' ? 0 : 1}],
          {duration:380, delay, easing:'cubic-bezier(.5,0,.9,.4)', fill:'forwards'});
      });
      win.setTimeout(() => old.remove(), longest + 40);
    }
    function build(p) {
      const box = doc.createElement('div');
      box.className = 'toon-sky'; box.dataset.weather = p.weather; box.dataset.night = String(p.night);
      let index = 0;
      if (p.rainbow) { const r = piece(rainbow(), 'toon-rainbow', 'pop'); box.append(r); enter(r, index++); }
      if (p.sun) { const s = piece(sun(p.colors === PALETTE.dusk), 'toon-sun', 'top'); box.append(s); enter(s, index++); }
      if (p.moon) { const m = piece(moon(), 'toon-moon', 'top'); box.append(m); enter(m, index++); }
      for (let i = 0; i < p.stars; i++) {
        const s = piece(star(), 'toon-star' + (i % 4 === 1 ? ' toon-twinkle' : ''), 'pop');
        place(s, STARS[i][0], STARS[i][1]); s.style.width = (i % 3 ? 11 : 16) + 'px';
        box.append(s); enter(s, index++);
      }
      if (p.fog) for (let i = 0; i < 4; i++) {
        const f = doc.createElement('div'); f.className = 'toon toon-fog'; f.dataset.from = i % 2 ? 'right' : 'left';
        f.style.left = (i % 2 ? 14 : -18) + 'vw'; f.style.top = (12 + i * 13) + 'vh';
        box.append(f); enter(f, index++);
      }
      for (let i = 0; i < p.clouds; i++) {
        const slot = SLOTS[i % SLOTS.length];
        const c = piece(cloud(p.colors), 'toon-cloud' + (slot.mid ? ' toon-mid' : ''), slot.from);
        c.firstChild.style.setProperty('--bob', (9 + (i * 1.7) % 5).toFixed(1) + 's');
        c.firstChild.style.setProperty('--bob-delay', (-i * 1.3).toFixed(1) + 's');
        place(c, slot.x, slot.y, slot.w); box.append(c); enter(c, index++);
      }
      if (p.bolt) { const b = piece(bolt(), 'toon-bolt', 'pop'); place(b, 38, 22, 16); box.append(b); enter(b, index++); }
      // Chuva e neve: uma camada só, que aparece depois que as nuvens chegam.
      if (p.rain || p.snow) {
        const fx = doc.createElement('div'), sheet = doc.createElement('div');
        fx.className = 'toon-fx' + (p.windy ? ' toon-windy' : '');
        sheet.className = p.snow ? 'toon-snow' : 'toon-rain';
        sheet.style.backgroundImage = p.snow ? snowTile() : rainTile(RAIN[p.rain].dense, p.night);
        if (p.rain) sheet.style.setProperty('--fall', RAIN[p.rain].speed + 's');
        fx.append(sheet); box.append(fx);
        if (!reduced()) fx.animate?.([{opacity:0}, {opacity:1}], {duration:500, delay:650, fill:'backwards'});
      }
      return box;
    }
    function render() {
      timer = 0;
      const host = doc.querySelector('.sky-effects');
      if (!host) return;
      const d = html.dataset;
      const p = plan({weather:d.weather, phase:d.phase, solar:d.solar, clouds:d.clouds, rain:d.rain, wind:d.wind, rainbow:d.rainbow});
      if (p.weather === 'unknown' && !layer) return;            // espera a primeira previsão
      if (p.key === current && !cityPending && layer) return;   // mesma cena e mesma cidade: nada a refazer
      const old = layer;
      layer = build(p); current = p.key; cityPending = false;
      leave(old); host.append(layer);
    }
    function soon(ms) { win.clearTimeout(timer); timer = win.setTimeout(render, ms); }
    // Troca de cidade: refaz a entrada mesmo que o céu seja igual; espera o céu da cidade nova assentar.
    win.addEventListener('pluvia:city-changed', () => { cityPending = true; soon(1600); });
    win.addEventListener('pluvia:weather-updated', () => soon(cityPending ? 150 : 250));
    new win.MutationObserver(() => soon(250)).observe(html, {attributes:true, attributeFilter:['data-phase', 'data-solar', 'data-weather', 'data-rain', 'data-clouds', 'data-wind', 'data-rainbow']});
    soon(300);
  }

  return {plan, cloudPath, moonPath, CLOUD, SLOTS, STARS, PALETTE, CLOUDS, WEATHERS, mount};
});
