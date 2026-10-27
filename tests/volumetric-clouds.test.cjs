const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const volume = require('../dist/modules/volumetric-clouds.js');

// Só a noite com nublado, chuva ou trovoada ganha a nuvem volumétrica.
assert.equal(volume.mode({phase:'night',weather:'cloud'}),'cloud');
assert.equal(volume.mode({phase:'night',weather:'rain'}),'rain');
assert.equal(volume.mode({phase:'night',weather:'rain',rain:'heavy'}),'heavy');
assert.equal(volume.mode({phase:'night',weather:'storm'}),'heavy');
for (const weather of ['sun','partly','few','fog','snow','unknown']) assert.equal(volume.mode({phase:'night',weather}),null,weather);
for (const weather of ['cloud','rain','storm']) assert.equal(volume.mode({phase:'day',weather}),null,`dia ${weather}`);
assert.equal(volume.mode(null),null);
for (const palette of Object.values(volume.PALETTES)) {
  assert.match(palette.lit,/^#[0-9a-f]{6}$/); assert.match(palette.shade,/^#[0-9a-f]{6}$/);
  assert.ok(palette.cover > .3 && palette.cover < .6); assert.ok(palette.dens > 0);
}
// O shader é WebGL 1 com laços de tamanho fixo (exigência do GLSL ES 1.0 no Safari).
assert.match(volume.FS,/precision mediump float/);
assert.doesNotMatch(volume.FS,/for\(int i=0;i<[a-zA-Z]/);

const root = path.join(__dirname,'..','dist');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw = fs.readFileSync(path.join(root,'sw.js'),'utf8');
const css = fs.readFileSync(path.join(root,'sky.css'),'utf8');
const src = fs.readFileSync(path.join(root,'modules','volumetric-clouds.js'),'utf8');
const ref = html.match(/modules\/volumetric-clouds\.js\?v=[\w-]+/)[0];
assert.ok(sw.includes(`./${ref}`),'precache acompanha a versão do HTML');
// As camadas do CSS só somem com data-volume="on"; sem ele (sem WebGL, movimento reduzido, quadros lentos) ficam.
assert.match(css,/:root\[data-volume="on"\] \.sky-effects > \.sky-clouds \{[^}]*visibility:hidden/);
assert.match(css,/prefers-reduced-motion: reduce\) \{ \.sky-volume \{ display:none/);
// Desiste e volta ao CSS: contexto perdido e quadros lentos.
assert.match(src,/webglcontextlost/); assert.match(src,/off\('slow'\)/);
// A automação de QA mede as camadas do CSS: sem a chave pluvia-volume-qa a nuvem volumétrica não liga.
assert.match(src,/navigator\?\.webdriver/);
console.log('volumetric-clouds ok');
