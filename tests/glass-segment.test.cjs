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
