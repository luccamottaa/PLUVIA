const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('precache do SW lista os mesmos JS/CSS versionados do HTML', () => {
  const htmlRefs = [...html.matchAll(/src="(\.\/(?:modules\/)?[^"]+\.js\?v=[^"]+)"/g), ...html.matchAll(/href="(\.\/[^"?]+\.css\?v=[^"]+)"/g)].map(m => m[1]);
  assert.ok(htmlRefs.length >= 10);
  for (const ref of htmlRefs) {
    assert.ok(sw.includes(`"${ref}"`) || sw.includes(`'${ref}'`) || sw.includes(ref), `SW sem ${ref}`);
  }
  assert.match(sw, /const CACHE = "pluvia-panel-35"/);
  assert.match(html, /styles\.css\?v=core-120/);
  assert.match(html, /redesign\.css\?v=panel-28/);
  assert.doesNotMatch(sw, /glass\.js/);
  assert.match(html, /app\.js\?v=panel-26/);
  assert.ok(!sw.includes('"./assets/panel-night-sky.webp"'), 'não baixa a antiga foto sem uso no cache inicial');
  for (const asset of ['sky-sun.svg','sky-cloud-bank.webp']) assert.ok(sw.includes(`./assets/${asset}`));
  assert.ok(sw.includes('./assets/moon-surface.webp'),'textura lunar disponível no modo offline');
  assert.ok(fs.statSync(path.join(root,'assets/moon-surface.webp')).size < 30000,'textura leve para mobile');
});

test('shell iOS e domínio canônico estão travados', () => {
  assert.match(html, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(html, /mobile-web-app-capable" content="yes"/);
  assert.match(html, /luccamottaa\.github\.io/);
  assert.match(html, /https:\/\/pluviaweather\.com\.br/);
  assert.equal(fs.readFileSync(path.join(root, 'CNAME'), 'utf8').trim(), 'pluviaweather.com.br');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.id, 'https://pluviaweather.com.br/');
  assert.equal(manifest.theme_color, '#10233f');
  assert.equal(manifest.start_url, 'https://pluviaweather.com.br/?source=pwa');
});
