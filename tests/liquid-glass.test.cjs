const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(dist, 'styles.css'), 'utf8');
const script = fs.readFileSync(path.join(dist, 'glass.js'), 'utf8');
const sw = fs.readFileSync(path.join(dist, 'sw.js'), 'utf8');

test('o reflexo dos cards acompanha dedo/cursor e entra no precache', () => {
  assert.match(html, /src="\.\/glass\.js\?v=core-117"/);
  assert.match(sw, /"\.\/glass\.js\?v=core-117"/);
  assert.match(script, /pointermove/);
  assert.match(script, /pointerdown/);
  assert.match(script, /pointercancel/);
  assert.match(script, /requestAnimationFrame/);
  assert.match(script, /--glass-x/);
  assert.match(css, /radial-gradient\(circle 240px at var\(--glass-x,50%\) var\(--glass-y,50%\)/);
  assert.match(css, /glass-touch-wave/);
  assert.doesNotMatch(script, /preventDefault|setPointerCapture/, 'o efeito não deve bloquear rolagem ou controles do mapa');
});

test('o vidro preserva cartões de alerta e ajustes de acessibilidade', () => {
  assert.match(css, /\.panel:not\(\.attention-card\):not\(\.air-metric\[data-aqi-level\]\):not\(\.sun-section\.is-night\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /prefers-reduced-transparency:reduce/);
  assert.match(css, /\.glass-touch-ring \{ display:none; \}/);
  assert.match(script, /reducedMotion\.matches && !reducedTransparency\.matches/);
});
