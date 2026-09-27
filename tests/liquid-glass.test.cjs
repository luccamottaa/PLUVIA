const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(dist, 'styles.css'), 'utf8');
const redesign = fs.readFileSync(path.join(dist, 'redesign.css'), 'utf8');
const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');

test('os cards preservam o vidro estático sem reflexo acionado por toque', () => {
  assert.match(css, /backdrop-filter:blur\(22px\) saturate\(170%\)/);
  assert.match(css, /\.panel:not\(\.attention-card\):not\(\.air-metric\[data-aqi-level\]\):not\(\.sun-section\.is-night\)/);
  assert.doesNotMatch(html + sw, /glass\.js/);
  assert.equal(fs.existsSync(path.join(dist, 'glass.js')), false);
  assert.doesNotMatch(css + redesign, /glass-interactive|glass-active|glass-touch-ring|--glass-x|--glass-y/);
});

test('o topo rola com a página, a gota é azul e o nome tem espaço', () => {
  assert.match(html, /class="brand-mark" aria-hidden="true"/);
  assert.match(redesign, /\.topbar \{ position:relative; top:auto; \}/);
  assert.match(redesign, /\.topbar \.brand-mark \{[\s\S]*?background:#2F6BFF/);
  assert.match(redesign, /\.topbar \.account-trigger \{ max-width:min\(44vw,180px\);/);
});
