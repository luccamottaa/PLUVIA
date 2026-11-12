// Mini travadas na troca de cidade (1.68.4): perfil com CPU 4× mais lenta apontou o story do compartilhamento
// (reduzir a textura do véu e codificar PNG a cada cidade) e o reajuste do ritmo das nuvens CSS escondidas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const card = require('../dist/modules/share-card.js');
const root = path.join(__dirname, '..', 'dist');

test('o story sai em JPEG (o fundo é opaco) e o arquivo compartilhado leva a extensão certa', () => {
  assert.equal(card.TYPE, 'image/jpeg');
  assert.equal(card.EXTENSION, 'jpg');
  const src = fs.readFileSync(path.join(root, 'modules/share-card.js'), 'utf8');
  assert.match(src, /resolve\(blob\); \}, TYPE, \.9\)\)/);
  assert.doesNotMatch(src, /'image\/png'\)\);/);
  const share = fs.readFileSync(path.join(root, 'modules/share-weather.js'), 'utf8');
  assert.match(share, /\.\$\{cards\.EXTENSION \|\| 'png'\}`,\{type:blob\.type \|\| cards\.TYPE \|\| 'image\/png'\}/);
});

test('o véu do story é reduzido uma vez por sessão e a imagem não é decodificada de novo', async () => {
  const draws = [], made = [];
  let loads = 0;
  class Image { set src(value) { loads++; this._src = value; setImmediate(() => this.onload?.()); } get src() { return this._src; } }
  const ctx = () => ({
    createLinearGradient: () => ({ addColorStop() {} }), fillRect() {}, drawImage(image, ...args) { draws.push([image?.tag || image?.src || 'canvas', args.length]); },
    fillText() {}, measureText: () => ({ width: 10 }), beginPath() {}, rect() {}, roundRect() {}, fill() {}
  });
  const doc = {
    defaultView: { Image, PLUVIA: {} }, fonts: { load: async () => {} },
    createElement() { const c = { width: 0, height: 0, tag: 'canvas' + made.length, getContext: ctx, toBlob(fn, type, q) { fn({ type, q }); } }; made.push(c); return c; }
  };
  const data = { city: 'Manaus', temperature: 31, condition: 'Nublado', feels: 34, high: 33, low: 25, stamp: 'agora', source: 'Open-Meteo', code: 3, night: false, solar: 'none', rain: null, badge: null };
  const first = await card.render(data, { document: doc });
  assert.equal(first.type, 'image/jpeg');
  assert.equal(first.q, .9);
  const scaledFromTexture = draws.filter(([what, n]) => /sky-cloud-veil/.test(what) && n === 4).length;
  assert.equal(scaledFromTexture, 1, 'a textura grande é reduzida na primeira vez');
  const loadsAfterFirst = loads;
  draws.length = 0;
  await card.render(data, { document: doc });
  assert.equal(draws.filter(([what]) => /sky-cloud-veil/.test(what)).length, 0, 'depois só copia o recorte guardado');
  assert.equal(loads, loadsAfterFirst + 1, 'só a logo é carregada de novo; o véu fica guardado');
});

