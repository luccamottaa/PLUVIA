const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 1.69.3 (pedido do dono): no celular a busca abria com o campo focado e o teclado subia junto.
const app = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8');
const start = app.indexOf('function searchInputFirst(');
const source = app.slice(start, app.indexOf('\nfunction openCitySearch(', start));
const searchInputFirst = vm.runInNewContext(source + ';searchInputFirst');
const screen = touch => ({matchMedia: query => ({matches: touch && query === '(hover: none) and (pointer: coarse)'})});

test('no celular (toque) a busca abre sem focar o campo, então o teclado não sobe', () => {
  assert.equal(searchInputFirst({focusInput:true}, screen(true)), false);
});

test('no computador a pílula da busca continua abrindo pronta para digitar', () => {
  assert.equal(searchInputFirst({focusInput:true}, screen(false)), true);
});

test('quem não pediu o campo (bolinhas, aviso, atalho) nunca recebe foco no campo', () => {
  assert.equal(searchInputFirst(undefined, screen(false)), false);
  assert.equal(searchInputFirst({}, screen(false)), false);
});

test('sem matchMedia (navegador antigo) mantém o comportamento de antes', () => {
  assert.equal(searchInputFirst({focusInput:true}, {}), true);
});

test('openCitySearch usa a regra nova em vez de focar o campo direto', () => {
  assert.match(app, /if \(searchInputFirst\(options\)\) \$\("citySearch"\)\.focus/);
  assert.doesNotMatch(app, /if \(options\?\.focusInput\) \$\("citySearch"\)\.focus/);
});
