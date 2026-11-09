// Seletor de vidro que segue o dedo (1.53): funções puras de posição, encaixe e esticão.
const test = require('node:test');
const assert = require('node:assert/strict');
const { position, nearest, stretch } = require('../dist/modules/glass-segment.js');

test('a bolha acompanha o dedo em segmentos contínuos', () => {
  assert.equal(position(0, 46, 46, 3), 1);
  assert.equal(position(0, 23, 46, 3), 0.5);
  assert.equal(position(1, -23, 46, 3), 0.5);
});

test('passando das bordas o movimento é amortecido, mas não some', () => {
  const left = position(0, -40, 46, 3);
  const right = position(2, 80, 46, 3);
  assert.ok(left < 0 && left > -0.6, `esquerda ${left}`);
  assert.ok(right > 2 && right < 2.6, `direita ${right}`);
});

test('encaixa no segmento mais próximo e nunca sai dos limites', () => {
  assert.equal(nearest(0.4, 3), 0);
  assert.equal(nearest(0.6, 3), 1);
  assert.equal(nearest(-0.3, 3), 0);
  assert.equal(nearest(2.7, 3), 2);
  assert.equal(nearest(NaN, 3), 0);
});

test('o esticão cresce com a velocidade e para no máximo', () => {
  assert.equal(stretch(0), 1);
  assert.ok(stretch(0.5) > 1 && stretch(0.5) <= 1.14);
  assert.equal(stretch(10), 1.14);
  assert.equal(stretch(-0.5), stretch(0.5));
});

// O ResizeObserver só agenda a medição para o próximo quadro (uma por quadro): medir e escrever estilo dentro do
// callback fazia o WebKit soltar "ResizeObserver loop completed with undelivered notifications".
test('redimensionar agenda uma medição por quadro, fora do callback do observer', () => {
  const { start } = require('../dist/modules/glass-segment.js');
  const writes = [], frames = [];
  let observed = null;
  const button = (left, pressed) => ({ offsetLeft: left, offsetWidth: 44, getAttribute: () => (pressed ? 'true' : 'false') });
  const buttons = [button(2, true), button(48, false), button(94, false)];
  const group = {
    dataset: {},
    style: { setProperty: (name, value) => writes.push([name, value]) },
    querySelectorAll: () => buttons,
    addEventListener() {},
  };
  const root = {
    PointerEvent: function () {},
    document: { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [group] },
    ResizeObserver: function (callback) { this.observe = () => { observed = callback; }; },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    matchMedia: () => ({ matches: false }),
  };
  start(root);
  assert.equal(group.dataset.glassSegment, 'on');
  assert.ok(observed, 'observa o grupo');
  writes.length = 0;
  observed(); observed(); observed();
  assert.equal(writes.length, 0, 'nada é medido nem escrito dentro do callback');
  assert.equal(frames.length, 1, 'três notificações no mesmo quadro viram uma medição');
  frames.shift()();
  assert.deepEqual(writes.map(([name]) => name), ['--seg-x0', '--seg-w', '--seg-step']);
  observed();
  assert.equal(frames.length, 1, 'depois do quadro, uma nova notificação agenda de novo');
});
