const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
const script = html.match(/<script>\s*(\(function \(\) \{\s*var intro = document\.getElementById\("pluviaIntro"\);[\s\S]*?\}\)\(\);)\s*<\/script>/)?.[1];
assert.ok(script, 'o controlador da introdução deve rodar sem depender do carregamento da previsão');

test('a intro recebe estilo e cor do tema antes dos recursos externos', () => {
  assert.ok(html.indexOf('.pluvia-intro {') < html.indexOf('href="./styles.css'), 'o estilo inicial deve estar no HTML');
  assert.match(html, /@media \(prefers-color-scheme:light\) \{[\s\S]*?\.pluvia-intro \{ background:#f6f3ed;/);
  assert.match(html, /rel="stylesheet" href="\.\/styles\.css\?v=core-113" media="print"/);
  assert.match(html, /rel="stylesheet" media="print" onload="this\.media='all'"/);
});

function runIntro({ saved = false, storageBlocked = false, reduced = false } = {}) {
  const timers = [];
  const intro = { hidden: false, dataset: {}, classList: { classes: [], add(name) { this.classes.push(name); } } };
  const view = { hidden: true }, nav = { hidden: true }, welcome = { hidden: false };
  const nodes = { pluviaIntro: intro, locationWelcome: welcome, weatherView: view, siteNav: nav };
  const context = {
    document: { getElementById: id => nodes[id] },
    window: { matchMedia: () => ({ matches: reduced }) },
    sessionStorage: {
      getItem() { if (storageBlocked) throw Error('blocked'); return saved ? '1' : null; },
      setItem() { if (storageBlocked) throw Error('blocked'); },
    },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); },
  };
  vm.runInNewContext(script, context);
  return { intro, view, nav, welcome, timers };
}

test('a abertura sai sozinha mesmo sem executar o código da previsão', () => {
  const { intro, view, nav, welcome, timers } = runIntro({ storageBlocked: true });
  assert.equal(timers[0].delay, 2600);
  timers[0].callback();
  assert.equal(view.hidden, false);
  assert.equal(nav.hidden, false);
  assert.equal(welcome.hidden, true);
  assert.deepEqual(intro.classList.classes, ['is-leaving']);
  timers.find(timer => timer.delay === 450).callback();
  assert.equal(intro.hidden, true);
});

test('a saída automática não dispara duas vezes', () => {
  const { intro, timers } = runIntro();
  timers[0].callback();
  timers[0].callback();
  assert.deepEqual(intro.classList.classes, ['is-leaving']);
  timers.find(timer => timer.delay === 450).callback();
  assert.equal(intro.hidden, true);
});

test('sessões já vistas ignoram a abertura; movimento reduzido encurta a duração', () => {
  const previous = runIntro({ saved: true });
  assert.equal(previous.intro.hidden, true);
  assert.equal(previous.timers.length, 0);
  assert.equal(runIntro({ reduced: true }).timers[0].delay, 300);
});
