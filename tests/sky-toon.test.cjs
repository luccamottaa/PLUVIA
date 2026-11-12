const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const toon = require('../dist/modules/sky-toon.js');

const dist = file => fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8');

test('cada condição tem a sua cena: nuvens, Sol, Lua, estrelas, chuva, neve, raio e neblina', () => {
  const day = weather => toon.plan({weather, phase:'day'}), night = weather => toon.plan({weather, phase:'night'});
  assert.equal(day('sun').sun, true); assert.equal(day('sun').clouds, 0, 'céu limpo não tem nuvem'); assert.equal(day('sun').stars, 0);
  assert.equal(toon.plan({weather:'partly', phase:'day', clouds:'few'}).clouds, 3);
  assert.equal(day('partly').clouds, 5);
  assert.equal(day('cloud').sun, false); assert.equal(day('cloud').clouds, 9);
  assert.equal(day('rain').rain, 'light', 'chuva sem intensidade conhecida é fraca');
  assert.equal(toon.plan({weather:'rain', phase:'day', rain:'heavy'}).rain, 'heavy');
  assert.equal(day('storm').bolt, true); assert.equal(day('storm').rain, 'moderate', 'trovoada sem volume usa o perfil moderado, como o céu antigo');
  assert.equal(day('snow').snow, true); assert.equal(day('fog').fog, true);
  assert.equal(night('sun').moon, true); assert.equal(night('sun').stars, toon.STARS.length); assert.equal(night('sun').clouds, 0);
  assert.equal(night('cloud').moon, true, 'Lua atrás das nuvens'); assert.equal(night('cloud').stars, 0);
  assert.equal(night('rain').moon, false);
  assert.equal(night('sun').sun, false, 'Sol nunca de noite');
});

test('vento forte inclina só a chuva; arco-íris só de dia', () => {
  assert.equal(toon.plan({weather:'rain', phase:'day', wind:'strong'}).windy, true);
  assert.equal(toon.plan({weather:'sun', phase:'day', wind:'strong'}).windy, false);
  assert.equal(toon.plan({weather:'partly', phase:'day', rainbow:'on'}).rainbow, true);
  assert.equal(toon.plan({weather:'partly', phase:'night', rainbow:'on'}).rainbow, false);
});

test('nuvens claras ficam rosadas no nascer e no pôr do sol; as de chuva não', () => {
  assert.equal(toon.plan({weather:'partly', phase:'day', solar:'sunset'}).colors, toon.PALETTE.dusk);
  assert.notEqual(toon.plan({weather:'rain', phase:'day', solar:'sunset'}).colors, toon.PALETTE.dusk);
  for (const phase of ['day', 'night']) for (const weather of toon.WEATHERS) {
    const colors = toon.plan({weather, phase}).colors;
    assert.equal(colors.length, 2, `${phase}/${weather}`);
    for (const color of colors) assert.match(color, /^#[0-9a-f]{6}$/);
  }
});

test('a chave da cena muda quando o céu muda e é igual para o mesmo céu', () => {
  const a = toon.plan({weather:'rain', phase:'day', rain:'light'}).key;
  assert.equal(toon.plan({weather:'rain', phase:'day', rain:'light'}).key, a);
  assert.notEqual(toon.plan({weather:'rain', phase:'day', rain:'heavy'}).key, a);
  assert.notEqual(toon.plan({weather:'rain', phase:'night', rain:'light'}).key, a);
  assert.equal(toon.plan({weather:'tornado'}).weather, 'unknown');
  assert.equal(toon.plan({weather:'few'}).weather, 'unknown', 'few é contagem de nuvens, não condição');
});

test('nuvem é um contorno só de cinco arcos com base reta, sem retângulo', () => {
  const d = toon.CLOUD;
  assert.match(d, /^M[\d.]+ 208/);
  assert.match(d, /Z$/);
  assert.equal((d.match(/A/g) || []).length, 5);
  assert.doesNotMatch(d, /NaN|Infinity/);
  assert.doesNotMatch(d, /[HVL]/, 'só arcos: a base reta é o fechamento do caminho');
});

test('Lua desenhada na fase real: nada na nova, disco cheio na cheia, lado certo no crescente', () => {
  assert.equal(toon.moonPath(0), '');
  assert.equal(toon.moonPath(.99), '');
  assert.equal(toon.moonPath(NaN), '');
  assert.match(toon.moonPath(.5), /^M40 6 A34 34 0 0 0 40 74 A34\.000 34/);
  assert.match(toon.moonPath(.25), /^M40 6 A34 34 0 0 1 40 74 L40 6Z$/, 'quarto crescente: metade direita');
  assert.match(toon.moonPath(.1), /0 0 1 40 74/, 'crescente iluminado à direita');
  assert.match(toon.moonPath(.9), /0 0 0 40 74/, 'minguante iluminado à esquerda');
});

test('lugares das nuvens: as do meio surgem no lugar (não atravessam o texto) e ficam translúcidas', () => {
  for (const slot of toon.SLOTS) {
    if (slot.mid) assert.equal(slot.from, 'pop');
    else assert.ok(['left', 'right', 'top'].includes(slot.from));
  }
  assert.ok(toon.SLOTS.length >= Math.max(...Object.values(toon.CLOUDS)));
  assert.match(dist('sky.css'), /\.toon-mid \{ opacity:\.5; \}/);
});

test('céu de desenho é o único céu: camadas antigas, nuvem 3D e a chave classic saíram (1.71)', () => {
  const html = dist('index.html'), css = dist('sky.css'), sw = dist('sw.js'), toon = dist('modules/sky-toon.js');
  assert.match(html, /<div class="sky-effects" data-motion="paused" aria-hidden="true"><\/div>/, 'a cena começa vazia: o desenho é montado pelo sky-toon');
  assert.match(html, /<script src="\.\/modules\/sky-toon\.js\?v=[\w-]+" defer><\/script>/);
  assert.match(sw, /"\.\/modules\/sky-toon\.js\?v=[\w-]+"/);
  for (const gone of ['volumetric-clouds', 'sky-parallax', 'pluvia-sky-style', 'data-sky']) assert.ok(!html.includes(gone) && !sw.includes(gone), gone);
  for (const gone of ['.sky-stars', '.sky-clouds', '.sky-rain', '.sky-lightning', '.sky-meteor', '.sky-rainbow', '.sky-sun', '.sky-moon', '.sky-volume', '.intro-sky', 'data-sky']) assert.ok(!css.includes(gone), gone);
  assert.doesNotMatch(toon, /classic/);
  assert.match(css, /\.sky-effects\[data-motion="paused"\] \*/, 'cena parada pausa o desenho');
  assert.match(css, /prefers-reduced-motion:reduce\) \{ \.toon-sky \* \{ animation:none !important; \}/);
  for (const file of ['modules/volumetric-clouds.js', 'modules/sky-parallax.js']) assert.equal(require('node:fs').existsSync(require('node:path').join(__dirname, '../dist', file)), false, file);
});

test('janelas ganham o mesmo céu de desenho atrás do conteúdo, menos o radar (1.72)', () => {
  const src = dist('modules/sky-toon.js'), css = dist('sky.css') + dist('dialogs.css');
  assert.ok(toon.SHEET_SLOTS.length >= 5);
  for (const slot of toon.SHEET_SLOTS) {
    assert.ok(['left', 'right', 'top', 'pop'].includes(slot.from));
    // O meio da janela fica para o conteúdo: as nuvens grandes vivem no alto (y < 20) ou no horizonte (y > 75).
    if (!slot.mid) assert.ok(slot.y < 20 || slot.y > 75, `nuvem no meio do conteúdo: ${JSON.stringify(slot)}`);
  }
  assert.match(src, /querySelectorAll\('dialog\.dlg-todas'\)/);
  assert.match(src, /radarDialog/, 'o mapa do radar cobre a janela inteira');
  assert.match(src, /attributeFilter:\['open'\]/);
  assert.match(css, /\.toon-sheet \{ z-index:-1; border-radius:inherit; \}/, 'atrás do conteúdo, dentro do canto arredondado');
  assert.match(css, /\[data-toon\]::before,\s*html body :is\(\.dlg-todas, #_\)\[data-toon\]::after \{ content:none; \}/, 'estrelas e véu estáticos saem quando o desenho está lá');
  assert.match(css, /body\.page-hidden \.toon-sheet \*/, 'app em segundo plano pausa o desenho');
});

test('surpresas: passarinho de dia sem chuva, estrela cadente em noite limpa, nada com chuva (1.73)', () => {
  const at = (weather, phase) => toon.surprise(toon.plan({weather, phase}));
  for (const w of ['sun', 'partly', 'cloud']) assert.equal(at(w, 'day'), 'bird', w);
  for (const w of ['rain', 'storm', 'snow', 'fog']) assert.equal(at(w, 'day'), null, w);
  for (const w of ['sun', 'partly']) assert.equal(at(w, 'night'), 'meteor', w);
  for (const w of ['cloud', 'rain', 'storm']) assert.equal(at(w, 'night'), null, w);
  assert.equal(toon.surprise(toon.plan({})), null, 'sem previsão, nada');
  assert.ok(toon.SURPRISE_FIRST[0] >= 10000 && toon.SURPRISE_EVERY[0] >= 45000, 'raras: não viram ruído');
  const src = dist('modules/sky-toon.js');
  assert.match(src, /host\.dataset\.motion !== 'running' \|\| doc\.hidden \|\| reduced\(\) \|\| doc\.querySelector\('dialog\[open\]'\)/, 'só com a cena à vista, sem janela e sem reduced-motion');
  assert.match(src, /run\.onfinish = run\.oncancel = \(\) => el\.remove\(\)/, 'um elemento, removido ao terminar');
  assert.match(dist('sky.css'), /\.toon-bird \.toon-wing \{[^}]*animation:toon-flap/);
});

test('chuva e neve são uma camada só (não um elemento por gota) e o módulo não usa will-change', () => {
  const src = dist('modules/sky-toon.js'), css = dist('sky.css');
  assert.doesNotMatch(src, /willChange|will-change\s*:/);
  assert.doesNotMatch(css.slice(css.indexOf('/* Céu de desenho (1.70')), /will-change\s*:/);
  assert.match(src, /sheet\.className = p\.snow \? 'toon-snow' : 'toon-rain'/);
});
