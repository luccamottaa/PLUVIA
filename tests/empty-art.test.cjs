// Telas vazias com desenho (1.73): a nuvem do céu de desenho, com rostinho, na busca sem resultado e no 404.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const toon = require('../dist/modules/sky-toon.js');
const dist = file => fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8');

test('desenhos usam o mesmo contorno de nuvem do céu e são leves', () => {
  for (const file of ['assets/toon/search-empty.svg', 'assets/toon/lost.svg']) {
    const svg = dist(file);
    assert.ok(svg.includes(`d="${toon.CLOUD}"`), `${file}: mesma nuvem do sky-toon`);
    assert.ok(Buffer.byteLength(svg) < 4096, `${file}: leve`);
    assert.match(svg, /role="img" aria-label="[^"]+"/);
  }
});

test('busca sem resultado mostra a nuvem com lupa; com resultado, não', () => {
  const app = dist('app.js'), css = dist('dialogs.css'), sw = dist('sw.js');
  assert.match(app, /status\.toggleAttribute\?\.\("data-empty", Boolean\(cityIndexReady && query && !shown\.length\)\)/);
  assert.match(css, /#cityDialog #cityPickerStatus\[data-empty\]::before \{[^}]*search-empty\.svg\?v=(toon-art-\d+)/);
  const version = css.match(/search-empty\.svg\?v=(toon-art-\d+)/)[1];
  assert.ok(sw.includes(`"./assets/toon/search-empty.svg?v=${version}"`), 'no cache offline: a busca funciona sem internet');
  assert.match(css, /prefers-reduced-motion:reduce\) \{ #cityDialog #cityPickerStatus\[data-empty\]::before \{ animation:none; \} \}/);
});

test('404 tem a nuvem confusa acima do código, decorativa', () => {
  const page = dist('404.html'), css = dist('legal.css');
  assert.match(page, /<img class="error-art" src="\/assets\/toon\/lost\.svg\?v=toon-art-\d+" alt="" width="200" height="140" \/>\s*<p class="error-code"/);
  assert.match(css, /prefers-reduced-motion:reduce\) \{ \.error-art \{ animation:none; \} \}/);
});
