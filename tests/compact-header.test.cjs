const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const api = require('../dist/modules/compact-header.js');

test('linha do cabeçalho compacto: temperatura e condição', () => {
  assert.equal(api.format('30', 'Céu limpo'), '30° | Céu limpo');
  assert.equal(api.format('-2', ''), '-2°');
  // Sem leitura (esqueleto vazio ou "--"), só a condição: nada de "--°".
  assert.equal(api.format('', 'Consultando o tempo…'), 'Consultando o tempo…');
  assert.equal(api.format('--', 'Indisponível'), 'Indisponível');
});

test('Sol e Lua esmaecem nos primeiros pixels de rolagem, em passos de 5%', () => {
  assert.equal(api.fadeFor(0), 1);
  assert.equal(api.fadeFor(40), 1);
  assert.equal(api.fadeFor(140), .5);
  assert.equal(api.fadeFor(240), 0);
  assert.equal(api.fadeFor(5000), 0);
  assert.equal(api.fadeFor(NaN), 1);
});

test('cabeçalho no HTML, no precache e sobre o degradê do céu, sem blur', () => {
  const html = fs.readFileSync('dist/index.html', 'utf8'), sw = fs.readFileSync('dist/sw.js', 'utf8');
  const css = fs.readFileSync('dist/continuous.css', 'utf8');
  assert.match(html, /<div class="compact-head" aria-hidden="true"><span class="sky-twilight sky-twilight-page"><\/span>/);
  // A película do crepúsculo de dentro vem depois da principal (captureSky lê a primeira).
  assert.ok(html.indexOf('class="compact-head"') > html.indexOf('sky-twilight-page'));
  assert.match(html, /modules\/compact-header\.js\?v=compact-1" defer/);
  assert.match(sw, /modules\/compact-header\.js\?v=compact-1/);
  const rule = css.slice(css.indexOf('.night-stage > .compact-head {'));
  assert.match(rule, /background-image:var\(--sky-color\)/);
  assert.match(rule, /background-size:100% 100lvh/);
  assert.doesNotMatch(rule.slice(0, rule.indexOf('}')), /backdrop-filter|blur/);
});
