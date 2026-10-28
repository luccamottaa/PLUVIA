const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const volume = require('../dist/modules/volumetric-clouds.js');

// Todo céu com nuvem ganha a nuvem 3D, de dia e de noite, e a neblina (1.36); céu limpo continua no CSS.
assert.equal(volume.mode({phase:'night',weather:'cloud'}),'night-cloud');
assert.equal(volume.mode({phase:'night',weather:'snow'}),'night-cloud');
assert.equal(volume.mode({phase:'night',weather:'rain'}),'night-rain');
assert.equal(volume.mode({phase:'night',weather:'rain',rain:'heavy'}),'night-heavy');
assert.equal(volume.mode({phase:'night',weather:'storm'}),'night-heavy');
assert.equal(volume.mode({phase:'night',weather:'partly'}),'night-partly');
assert.equal(volume.mode({phase:'day',weather:'partly',clouds:'few'}),'day-few');
assert.equal(volume.mode({phase:'day',weather:'cloud'}),'day-cloud');
assert.equal(volume.mode({phase:'day',weather:'rain'}),'day-rain');
assert.equal(volume.mode({phase:'day',weather:'storm'}),'day-heavy');
for (const phase of ['day','night']) for (const weather of ['sun','unknown']) assert.equal(volume.mode({phase,weather}),null,`${phase} ${weather}`);
assert.equal(volume.mode({phase:'day',weather:'fog'}),'day-fog'); assert.equal(volume.mode({phase:'night',weather:'fog'}),'night-fog');
assert.equal(volume.mode(null),null);
for (const name of ['few','partly','cloud','rain','heavy','fog']) for (const phase of ['day','night']) assert.ok(volume.PALETTES[`${phase}-${name}`],`${phase}-${name}`);
// No nublado/chuva de dia o texto branco fica por cima: a nuvem tem teto de brilho.
assert.ok(volume.PALETTES['day-cloud'].cap <= .75 && volume.PALETTES['day-rain'].cap <= .75);
for (const palette of Object.values(volume.PALETTES)) {
  assert.match(palette.lit,/^#[0-9a-f]{6}$/); assert.match(palette.shade,/^#[0-9a-f]{6}$/);
  assert.ok(palette.cover >= .3 && palette.cover <= .6); assert.ok(palette.dens > 0);
}
// O shader é WebGL 1 com laços de tamanho fixo (exigência do GLSL ES 1.0 no Safari).
assert.match(volume.FS,/precision mediump float/);
// Pôr/nascer do sol (TW) pinta a nuvem de laranja/rosa; topo iluminado e base mais cinza.
assert.match(volume.FS,/uniform float T,SUNI,TW,SIDE,CAP/); assert.match(volume.FS,/smoothstep\(\.05,\.85,hgt\)/);
// Contraluz: espalhamento para a frente (Henyey-Greenstein) e o brilho atravessando a parte fina.
assert.match(volume.FS,/float hg\(/); assert.match(volume.FS,/SUNI\*pow\(max\(cosA/);
assert.doesNotMatch(volume.FS,/for\(int i=0;i<[a-zA-Z]/);

const root = path.join(__dirname,'..','dist');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw = fs.readFileSync(path.join(root,'sw.js'),'utf8');
const css = fs.readFileSync(path.join(root,'sky.css'),'utf8');
const src = fs.readFileSync(path.join(root,'modules','volumetric-clouds.js'),'utf8');
const ref = html.match(/modules\/volumetric-clouds\.js\?v=[\w-]+/)[0];
assert.ok(sw.includes(`./${ref}`),'precache acompanha a versão do HTML');
// As camadas do CSS só somem com data-volume="on"; sem ele (sem WebGL, movimento reduzido, quadros lentos) ficam.
assert.match(css,/:root\[data-volume="on"\] :is\(\.sky-effects,\.intro-sky\) > \.sky-clouds \{[^}]*visibility:hidden/);
assert.match(css,/prefers-reduced-motion: reduce\) \{ \.sky-volume \{ display:none/);
// Desiste e volta ao CSS: contexto perdido e quadros lentos.
assert.match(src,/webglcontextlost/); assert.match(src,/off\('slow'\)/);
// A automação de QA mede as camadas do CSS: sem a chave pluvia-volume-qa a nuvem volumétrica não liga.
assert.match(src,/navigator\?\.webdriver/);
// As nuvens também se formam no lugar (o campo anda na altura), não só entram pela direita.
assert.match(volume.FS,/vec3 wind\(vec3 p\)\{return p\*SIZE\+vec3\(T\*[.0-9]+,T\*[.0-9]+,/);
console.log('volumetric-clouds ok');

// Raio dentro da nuvem (1.36): o mesmo ciclo de 39 s do CSS (storm-bolt), três raios nas mesmas posições.
assert.equal(volume.flash(0).k,0);
assert.deepEqual(volume.flash(4680 + 80),{k:1,x:.34});
assert.ok(volume.flash(4680 + 160).k < .5,'pisca depois do primeiro clarão');
assert.ok(Math.abs(volume.flash(17940 + 80).k - .95) < 1e-9 && volume.flash(17940 + 80).x === .76);
assert.ok(Math.abs(volume.flash(31200 + 80).k - .7) < 1e-9 && volume.flash(31200 + 80).x === .18);
assert.equal(volume.flash(4680 + 2300).k,0,'apaga em ~2 s');
assert.deepEqual(volume.flash(39000 + 4760),volume.flash(4760),'ciclo repete');
assert.equal(volume.flash(NaN).k,0);
for (const [share,x] of [[12,34],[46,76],[80,18]]) assert.ok(css.includes(`${share}.205%`) && css.includes(`calc(${x}vw - 50%)`),'posições batem com storm-bolt');
assert.match(volume.FS,/uniform float COVER,DENS,SIZE,EDGE,DETAIL,FLASH,FLASHX,FOG/);
assert.match(src,/animationName === 'storm-bolt'/);

// Lento cai para menos detalhe antes de desligar, contexto perdido religa uma vez e o motivo vai ao PostHog (1.40.1).
{
  const src = fs.readFileSync(path.join(root, 'modules/volumetric-clouds.js'), 'utf8');
  assert.match(src, /LOW_SCALE = \.33/);
  assert.match(src, /if \(scale === SCALE\) \{ scale = LOW_SCALE; frameMs = LOW_FRAME_MS; slow = 0; resize\(\); \}\s*else return off\('slow'\);/);
  assert.match(src, /if \(\+\+lost > 1\) return off\('lost'\);/);
  assert.match(src, /track\?\.\('Sky Effect Off',\{effect:'volume',reason:reason \|\| 'unsupported'\}\)/);
  const analytics = fs.readFileSync(path.join(root, 'analytics.js'), 'utf8');
  assert.match(analytics, /'Sky Effect Off'/);
  assert.match(analytics, /effect:new Set\(\['volume','glass'\]\)/);
  assert.match(analytics, /'slow','lost'\]/);
  // Nada de borda clara em volta da Lua (recusada pelo dono).
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'sky.css'), 'utf8'), /\.sky-moon::after/);
}
