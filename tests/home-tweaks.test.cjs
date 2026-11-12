// Ajustes de 1.73 pedidos pelo dono: ícone da umidade, linha do Tomorrow.io e "Mais do PLUVIA" recolhível.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dist = file => fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8');
const html = dist('index.html');
const icon = mode => html.match(new RegExp(`<button type="button" data-mode="${mode}"[^>]*>(<svg[^]*?</svg>)</button>`))[1];

test('umidade tem ícone próprio, diferente da gota da chuva', () => {
  const rain = icon('rain'), humidity = icon('humidity');
  const rainDrop = rain.match(/d="([^"]+)"/)[1];
  assert.ok(!humidity.includes(rainDrop), 'não reaproveita a gota da chuva');
  assert.match(humidity, /M3 16c1\.5-1\.4/, 'ondas de ar');
  assert.match(html, /data-mode="humidity" aria-pressed="false" aria-label="Umidade"/);
});

test('Tomorrow.io que respondeu não mostra a linha de status; sem cota ou sem resposta, mostra', () => {
  const app = dist('app.js');
  assert.match(app, /fromCache \|\| Boolean\(data\.pluviaReduced\) \|\| Boolean\(data\.pluviaTomorrow\)\);/);
  assert.doesNotMatch(app, /Boolean\(data\.pluviaSource \|\| data\.pluviaTomorrow\)/);
});

test('"Mais do PLUVIA" fica num cartão que abre e fecha, fechado por padrão, com os mesmos itens', () => {
  const nav = html.slice(html.indexOf('<nav class="account-more"'), html.indexOf('</nav>', html.indexOf('<nav class="account-more"')));
  assert.match(nav, /<details class="account-more-fold" id="accountMoreFold"><summary>Ajustes e informações<\/summary><div class="account-more-list">/);
  assert.doesNotMatch(nav, /accountMoreFold" open/);
  for (const id of ['textSizeDown', 'textSizeUp', 'openHomeLayout', 'tomorrowTest', 'openChangelog', 'openSources', 'openPrivacy']) assert.ok(nav.includes(`id="${id}"`), id);
  const css = dist('dialogs.css');
  assert.match(css, /#accountDialog \.account-more-fold\[open\]:not\(\[data-closing\]\) > summary::after \{ rotate:90deg; \}/);
  for (const script of ['verify-browser.py', 'verify-alignment.py', 'verify-visual.py', 'verify-home-ux.py'])
    assert.match(fs.readFileSync(path.join(__dirname, '../scripts', script), 'utf8'), /accountMoreFold'\)\.open=true/, script);
});
