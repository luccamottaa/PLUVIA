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
  // Desde a 1.60 a intro tem fundo fixo (sem céu dinâmico, pedido do dono); na 1.64 virou a noite amazônica.
  assert.match(html, /\.pluvia-intro \{[\s\S]*?background:radial-gradient\(130% 60% at 50% 112%,#0f6274 0%/);
  assert.ok(html.indexOf('src="./modules/sky-atmosphere.js') < html.indexOf('<body>'));
  assert.ok(html.indexOf('href="./sky.css') < html.indexOf('<body>'));
  assert.match(html, /rel="stylesheet" href="\.\/styles\.css\?v=core-138" media="print"/);
  assert.match(fs.readFileSync(path.join(__dirname, '../dist/fonts.css'), 'utf8'), /font-display:swap/);
});

function runIntro({ saved = false, storageBlocked = false, reduced = false, local = null, now = Date.parse('2026-10-09T05:00:00Z') } = {}) {
  const timers = [], listeners = {};
  const intro = { hidden: false, dataset: {}, querySelector: () => null, classList: { classes: [], add(name) { this.classes.push(name); } } };
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

test('intro só na primeira visita: quem já abriu o app vai direto para a Home', () => {
  const now = Date.parse('2026-10-09T05:00:00Z');
  const local = {};
  const first = runIntro({ local, now });
  assert.equal(first.intro.hidden, false, 'primeira visita mostra a intro');
  assert.equal(first.timers[0].delay, 2600, 'intro completa');
  assert.equal(Number(local['pluvia-intro-at']), now);
  const back = runIntro({ local, now: now + 20 * 60e3 });
  assert.equal(back.intro.hidden, true, 'voltar depois não mostra a intro');
  assert.equal(back.timers.length, 0, 'nenhuma espera na abertura');
  assert.equal(Number(local['pluvia-intro-at']), now + 20 * 60e3);
  const later = runIntro({ local: { 'pluvia-intro-at': String(now - 30 * 864e5) }, now });
  assert.equal(later.intro.hidden, true, 'nem um mês depois');
});

test('sem storage não dá para saber se é a primeira visita: mostra a intro completa', () => {
  const blocked = runIntro({ storageBlocked: true });
  assert.equal(blocked.intro.hidden, false);
  assert.equal(blocked.timers[0].delay, 2600);
});

test('a versão rápida da intro saiu do HTML', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '../dist/index.html'), 'utf8');
  assert.doesNotMatch(html, /data-quick|dataset\.quick/);
});