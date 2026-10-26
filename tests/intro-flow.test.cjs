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
  assert.match(html, /\.pluvia-intro \{[\s\S]*?background:var\(--sky-color/);
  assert.ok(html.indexOf('src="./modules/sky-atmosphere.js') < html.indexOf('<body>'));
  assert.ok(html.indexOf('href="./sky.css') < html.indexOf('<body>'));
  assert.match(html, /rel="stylesheet" href="\.\/styles\.css\?v=core-134" media="print"/);
  assert.match(fs.readFileSync(path.join(__dirname, '../dist/fonts.css'), 'utf8'), /font-display:swap/);
});

function runIntro({ saved = false, storageBlocked = false, reduced = false, local = null, now = Date.parse('2026-10-09T05:00:00Z') } = {}) {
  const timers = [], listeners = {};
  const intro = { hidden: false, dataset: {}, classList: { classes: [], add(name) { this.classes.push(name); } } };
  const view = { hidden: true }, welcome = { hidden: false };
  const nodes = { pluviaIntro: intro, locationWelcome: welcome, weatherView: view };
  const context = {
    document: { getElementById: id => nodes[id] },
    window: { matchMedia: () => ({ matches: reduced }), addEventListener: (type, callback) => { listeners[type] = callback; } },
    sessionStorage: {
      getItem() { if (storageBlocked) throw Error('blocked'); return saved ? '1' : null; },
      setItem() { if (storageBlocked) throw Error('blocked'); },
    },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); },
    Date: { now: () => now }, Number, String,
  };
  if (local) context.localStorage = { getItem: key => key in local ? local[key] : null, setItem: (key, value) => { local[key] = String(value); } };
  vm.runInNewContext(script, context);
  return { intro, view, welcome, timers, listeners, context };
}

test('a abertura sai sozinha mesmo sem executar o código da previsão', () => {
  const { intro, view, welcome, timers } = runIntro({ storageBlocked: true });
  assert.equal(timers[0].delay, 2600);
  timers[0].callback();
  assert.deepEqual(intro.classList.classes, [], 'sem a primeira consulta, o tempo mínimo não basta');
  const cap = timers.find(timer => timer.delay === 4600);
  assert.ok(cap, 'limite para internet lenta');
  cap.callback();
  assert.equal(view.hidden, false);
  assert.equal(welcome.hidden, true);
  assert.deepEqual(intro.classList.classes, ['is-leaving']);
  timers.find(timer => timer.delay === 450).callback();
  assert.equal(intro.hidden, true);
});

test('a intro espera a primeira consulta para a Home abrir com os dados novos', () => {
  const early = runIntro();
  early.listeners['pluvia:refresh-settled']();
  assert.deepEqual(early.intro.classList.classes, [], 'consulta rápida não encurta o tempo mínimo');
  early.timers[0].callback();
  assert.deepEqual(early.intro.classList.classes, ['is-leaving']);
  const late = runIntro();
  late.timers[0].callback();
  assert.deepEqual(late.intro.classList.classes, []);
  late.listeners['pluvia:refresh-settled']();
  assert.deepEqual(late.intro.classList.classes, ['is-leaving'], 'consulta depois do mínimo libera na hora');
  const missed = runIntro();
  missed.context.PLUVIA = { refreshSettledAt: 1 };
  missed.timers[0].callback();
  assert.deepEqual(missed.intro.classList.classes, ['is-leaving'], 'consulta que terminou antes do ouvinte também conta');
});

test('a saída automática não dispara duas vezes', () => {
  const { intro, timers, listeners } = runIntro();
  listeners['pluvia:refresh-settled']();
  timers[0].callback();
  timers[0].callback();
  timers.find(timer => timer.delay === 4600).callback();
  assert.deepEqual(intro.classList.classes, ['is-leaving']);
  timers.find(timer => timer.delay === 450).callback();
  assert.equal(intro.hidden, true);
});

test('sessões já vistas ignoram a abertura; movimento reduzido encurta a duração', () => {
  const previous = runIntro({ saved: true });
  assert.equal(previous.intro.hidden, true);
  assert.equal(previous.timers.length, 0);
  const reduced = runIntro({ reduced: true });
  assert.equal(reduced.timers[0].delay, 300);
  assert.ok(reduced.timers.some(timer => timer.delay === 1500));
});

test('voltar logo depois de o iPhone fechar o app não repete a intro; depois de 3 h ela volta', () => {
  const now = Date.parse('2026-10-09T05:00:00Z');
  const local = {};
  const first = runIntro({ local, now });
  assert.equal(first.intro.hidden, false, 'primeira abertura mostra a intro');
  assert.equal(Number(local['pluvia-intro-at']), now);
  const back = runIntro({ local, now: now + 20 * 60e3 });
  assert.equal(back.intro.hidden, true, 'nova sessão 20 min depois abre direto');
  assert.equal(back.timers.length, 0);
  assert.equal(Number(local['pluvia-intro-at']), now, 'pular não renova o horário da última intro');
  const later = runIntro({ local, now: now + 3 * 3600e3 + 1 });
  assert.equal(later.intro.hidden, false, '3 h depois a intro completa volta');
  const clockBack = runIntro({ local: { 'pluvia-intro-at': String(now + 3600e3) }, now });
  assert.equal(clockBack.intro.hidden, false, 'relógio que voltou no tempo não esconde a intro para sempre');
});

test('quem já viu uma intro ganha a versão rápida: 0,9 s de mínimo e 2,5 s de limite', () => {
  const now = Date.parse('2026-10-09T05:00:00Z');
  const first = runIntro({ local: {}, now });
  assert.equal(first.timers[0].delay, 2600, 'primeira visita: intro completa');
  assert.equal(first.intro.dataset.quick, undefined);
  const later = runIntro({ local: { 'pluvia-intro-at': String(now - 4 * 3600e3) }, now });
  assert.equal(later.intro.dataset.quick, '1');
  assert.equal(later.timers[0].delay, 900);
  assert.ok(later.timers.some(timer => timer.delay === 2500));
  later.listeners['pluvia:refresh-settled']();
  later.timers[0].callback();
  assert.deepEqual(later.intro.classList.classes, ['is-leaving']);
  assert.equal(runIntro({ storageBlocked: true }).timers[0].delay, 2600, 'sem storage não dá para saber: completa');
});

