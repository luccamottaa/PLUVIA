const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
const script = html.match(/<script>\s*(\(function \(\) \{\s*var intro = document\.getElementById\("pluviaIntro"\);[\s\S]*?\}\)\(\);)\s*<\/script>/)?.[1];
assert.ok(script, 'o controlador da introdução deve rodar sem depender do carregamento da previsão');

function runIntro({ saved = false, storageBlocked = false, reduced = false } = {}) {
  const timers = [];
  const intro = { hidden: false, dataset: {}, classList: { classes: [], add(name) { this.classes.push(name); } } };
  const view = { hidden: true }, nav = { hidden: true }, welcome = { hidden: false };
  const skip = { addEventListener(name, callback) { this[name] = callback; } };
  const nodes = { pluviaIntro: intro, locationWelcome: welcome, weatherView: view, siteNav: nav, skipIntro: skip };
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
  return { intro, view, nav, welcome, skip, timers };
}

test('a abertura sai sozinha mesmo sem executar o código da previsão', () => {
  const { intro, view, nav, welcome, timers } = runIntro({ storageBlocked: true });
  assert.equal(timers[0].delay, 3400);
  timers[0].callback();
  assert.equal(view.hidden, false);
  assert.equal(nav.hidden, false);
  assert.equal(welcome.hidden, true);
  assert.deepEqual(intro.classList.classes, ['is-leaving']);
  timers.find(timer => timer.delay === 450).callback();
  assert.equal(intro.hidden, true);
});

test('Pular funciona imediatamente e impede a saída automática duplicada', () => {
  const { intro, skip, timers } = runIntro();
  skip.click();
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
