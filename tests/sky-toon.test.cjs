const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const toon = require('../dist/modules/sky-toon.js');

const dist = file => fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8');

test('cada condição tem a sua cena: nuvens, Sol, Lua, estrelas, chuva, neve, raio e neblina', () => {
  const day = weather => toon.plan({weather, phase:'day'}), night = weather => toon.plan({weather, phase:'night'});
  assert.equal(day('sun').sun, true); assert.equal(day('sun').clouds, 1); assert.equal(day('sun').stars, 0);
  assert.equal(toon.plan({weather:'partly', phase:'day', clouds:'few'}).clouds, 3);
  assert.equal(day('partly').clouds, 5);
  assert.equal(day('cloud').sun, false); assert.equal(day('cloud').clouds, 9);
  assert.equal(day('rain').rain, 'light', 'chuva sem intensidade conhecida é fraca');
  assert.equal(toon.plan({weather:'rain', phase:'day', rain:'heavy'}).rain, 'heavy');
  assert.equal(day('storm').bolt, true); assert.equal(day('storm').rain, 'moderate', 'trovoada sem volume usa o perfil moderado, como o céu antigo');
  assert.equal(day('snow').snow, true); assert.equal(day('fog').fog, true);
  assert.equal(night('sun').moon, true); assert.equal(night('sun').stars, toon.STARS.length);
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

test('céu de desenho é o padrão; pluvia-sky-style=classic volta ao céu antigo', () => {
  const html = dist('index.html');
  const head = html.slice(0, html.indexOf('</head>'));
  const choose = head.indexOf('dataset.sky=localStorage.getItem("pluvia-sky-style")==="classic"?"classic":"toon"');
  assert.ok(choose > 0, 'a escolha do céu fica no <head>');
  assert.ok(choose < head.indexOf('<link rel="stylesheet" href="./sky.css?v='), 'antes do CSS do céu, para não piscar o céu antigo');
  assert.match(html, /<script src="\.\/modules\/sky-toon\.js\?v=[\w-]+" defer><\/script>/);
  assert.match(dist('sw.js'), /"\.\/modules\/sky-toon\.js\?v=[\w-]+"/);
  const css = dist('sky.css');
  assert.match(css, /:root\[data-sky="toon"\] \.sky-effects > :not\(\.toon-sky\) \{ display:none !important; \}/);
  assert.match(css, /\.sky-effects\[data-motion="paused"\] \.toon-sky \*/, 'cena parada pausa o desenho');
  assert.match(css, /prefers-reduced-motion:reduce\) \{ \.toon-sky \* \{ animation:none !important; \}/);
});

test('no céu de desenho a nuvem 3D não liga (nem compila o shader)', () => {
  const src = dist('modules/volumetric-clouds.js');
  assert.match(src, /const next = html\.dataset\.sky === 'toon' \? null : mode\(/);
  assert.match(src, /attributeFilter:\['data-phase','data-weather','data-rain','data-clouds','data-solar','data-wind','data-sky'\]/);
});

test('chuva e neve são uma camada só (não um elemento por gota) e o módulo não usa will-change', () => {
  const src = dist('modules/sky-toon.js'), css = dist('sky.css');
  assert.doesNotMatch(src, /willChange|will-change\s*:/);
  assert.doesNotMatch(css.slice(css.indexOf('/* Céu de desenho (1.70')), /will-change\s*:/);
  assert.match(src, /sheet\.className = p\.snow \? 'toon-snow' : 'toon-rain'/);
});
