// dialogs.css (1.72.2): as regras só das janelas ficam fora da abertura. Ver AGENTS.md, "CSS das janelas fora da abertura".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { styleRules, dialogOnly } = require('../scripts/dialog-css.cjs');
const dist = file => fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8');
const HOME = ['sky.css', 'styles.css', 'redesign.css', 'continuous.css'];
// Regras de janela que ficam nas folhas da Home de propósito: movê-las para o fim da cascata mudaria quem vence um
// empate de especificidade (achado comparando o estilo computado de cada elemento de cada janela).
const KEEP = new Set([
  'redesign.css|.dialog-scroll',
  'continuous.css|html body #accountDialog .notification-checks summary',
  'continuous.css|html body #accountDialog .account-delete > summary',
  // A trava que esconde janela aberta antes do dialogs.css chegar precisa estar na Home.
  'continuous.css|html:not([data-dialog-css]) dialog[open]'
]);

test('classificação: sujeito dentro de janela vai; Home, :has() e listas mistas ficam', () => {
  for (const sel of ['html body :is(.dlg-folha, #_) .dialog-scroll p', '#cityDialog .x, .dlg-todas .y', 'dialog::backdrop', '.city-dialog button', 'html body :is(.dlg-g14, #_)[open].pluvia-dialog-closing'])
    assert.equal(dialogOnly(sel), true, sel);
  for (const sel of ['html body :is(#accountButton, #openCitySearch, .dialog-close)', 'body:not(:has(dialog[open])) .topbar', 'body:has(dialog[open]) .topbar', '#cityDialog .x, .topbar .y', '#openCitySearch[aria-controls="cityDialog"]'])
    assert.equal(dialogOnly(sel), false, sel);
});

test('dialogs.css só tem regras de janela (o que a Home usa na abertura não pode depender dele)', () => {
  const rules = styleRules(dist('dialogs.css'));
  assert.ok(rules.length > 600, `regras em dialogs.css: ${rules.length}`);
  const home = rules.filter(sel => !dialogOnly(sel));
  assert.deepEqual(home, []);
});

test('folhas da Home sem regras só de janela, fora as que seguram a cascata', () => {
  const stray = [];
  for (const file of HOME) for (const sel of styleRules(dist(file))) if (dialogOnly(sel) && !KEEP.has(file + '|' + sel)) stray.push(file + ' › ' + sel);
  assert.deepEqual(stray, [], 'regra nova de janela vai para dist/dialogs.css');
});

test('dialogs.css chega depois da abertura, depois de continuous.css na cascata, e fica no cache offline', () => {
  const html = dist('index.html'), sw = dist('sw.js'), css = dist('continuous.css');
  const version = html.match(/link\.href = '\.\/dialogs\.css\?v=([\w-]+)'/)?.[1];
  assert.ok(version, 'carregador do dialogs.css no index.html');
  assert.doesNotMatch(html, /<link[^>]+dialogs\.css/, 'nada de <link> bloqueante: o carregador cria o link depois');
  assert.ok(sw.includes(`"./dialogs.css?v=${version}"`), 'precache com a mesma versão');
  assert.match(html, /\(d\.body \|\| root\)\.appendChild\(link\)/, 'no fim do body, depois de redesign.css e continuous.css');
  for (const trigger of ["'pointerdown', load", "'keydown', load", "attributeFilter: ['open']", 'requestIdleCallback']) assert.ok(html.includes(trigger), trigger);
  assert.ok(html.indexOf('./dialogs.css?v=') > html.indexOf('href="./continuous.css'), 'o carregador vem depois de continuous.css');
  assert.match(css, /html:not\(\[data-dialog-css\]\) dialog\[open\] \{ visibility:hidden; \}/, 'janela aberta cedo espera o estilo invisível');
});
