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
  assert.ok(stretch(0.5) > 1 && stretch(0.5) < 1.22);
  assert.ok(stretch(1) > stretch(0.5));
  assert.equal(stretch(10), 1.22);
  assert.equal(stretch(-0.5), stretch(0.5));
});

// Vidro de gelatina (1.67): a cápsula anda numa mola, estica na velocidade mantendo o volume e treme pela aceleração.
const { step, settled, shape, lensMap, JELLY, LENS } = require('../dist/modules/glass-segment.js');
const still = x => ({ x, v: 0, w: 0, wv: 0 });
function travel(from, to, seconds, segPx = 56) {
  const frames = [];
  let state = still(from);
  for (let t = 0; t < seconds; t += 1 / 60) { state = step(state, to, 1 / 60, segPx); frames.push(state); }
  return frames;
}

test('a mola leva a cápsula ao segmento com um quique curto e para em menos de um segundo', () => {
  const frames = travel(0, 3, 1.2);
  const peak = Math.max(...frames.map(frame => frame.x));
  assert.ok(peak > 3 && peak < 3.3, `passa um pouco do alvo e volta (${peak})`);
  assert.ok(frames[2].x > 0 && frames[2].x < 1.5, `sai do lugar aos poucos, não teleporta (${frames[2].x})`);
  const at = frames.findIndex(frame => settled(frame, 3));
  assert.ok(at > 0 && at < 60, `parada em ${at} quadros`);
  assert.ok(settled(frames.at(-1), 3));
  assert.equal(settled(still(0), 3), false);
});

test('a cápsula estica na direção do movimento e afina na outra, com o mesmo volume', () => {
  const frames = travel(0, 4, 0.5);
  const forms = frames.map(frame => shape(frame, 56));
  const widest = Math.max(...forms.map(form => form.sx));
  assert.ok(widest > 1.08, `estica visivelmente no meio do caminho (${widest})`);
  for (const form of forms) {
    assert.ok(Math.abs(form.sx * form.sy - 1) < 0.002, `volume ${form.sx * form.sy}`);
    assert.ok(form.sx < (1 + 0.22) * (1 + JELLY.maxWobble) + 0.001 && form.sx > 1 - JELLY.maxWobble - 0.001);
  }
  assert.deepEqual(shape(still(2), 56), { sx: 1, sy: 1 }, 'em repouso, sem deformação');
});

test('o tremor é alimentado pela aceleração: troca de sinal na freada e some sozinho', () => {
  const frames = travel(0, 2, 1.5);
  const wobble = frames.map(frame => frame.w);
  assert.ok(Math.max(...wobble) > 0.02, 'incha ao arrancar');
  assert.ok(Math.min(...wobble) < -0.02, 'encolhe ao frear');
  assert.ok(Math.abs(wobble.at(-1)) < 0.002, 'amortecido no fim');
  // Um empurrão só no tremor (o dedo encostando) não tira a cápsula do lugar.
  let state = { ...still(1), wv: JELLY.grab };
  for (let i = 0; i < 90; i++) state = step(state, 1, 1 / 60, 56);
  assert.ok(Math.abs(state.x - 1) < 1e-6 && settled(state, 1));
});

test('um quadro longo (aba que voltou do fundo) não faz a mola explodir', () => {
  let state = still(0);
  for (let i = 0; i < 20; i++) state = step(state, 4, 5, 56);
  assert.ok(Number.isFinite(state.x) && state.x > 0 && state.x < 5, String(state.x));
  assert.deepEqual(step(still(1), 1, 0, 56), still(1), 'sem tempo, nada muda');
});

test('mapa da lente: centro parado, borda empurra para dentro e fora da cápsula nada se move', () => {
  const width = 60, height = 48, map = lensMap(width, height, 1);
  assert.equal(map.width, width); assert.equal(map.height, height);
  assert.equal(map.data.length, width * height * 4);
  const at = (x, y) => [...map.data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];
  assert.deepEqual(at(30, 24), [128, 128, 128, 255], 'centro');
  const left = at(1, 24), right = at(58, 24), top = at(30, 1), bottom = at(30, 46);
  assert.ok(left[0] > 200 && Math.abs(left[1] - 128) < 8, `borda esquerda mostra o que está à direita (${left})`);
  assert.ok(right[0] < 56, `borda direita mostra o que está à esquerda (${right})`);
  assert.ok(top[1] > 200 && bottom[1] < 56, 'em cima e embaixo, para o meio');
  assert.deepEqual(at(0, 0), [128, 128, 128, 255], 'canto fora da cápsula');
  // A faixa que entorta é só a borda: a meio caminho do centro já está parado.
  assert.deepEqual(at(18, 24), [128, 128, 128, 255]);
  assert.ok(LENS.zoom > 1.2 && LENS.zoom < 1.4 && LENS.band < 0.5);
  assert.equal(lensMap(60, 48).width, 120, 'duas amostras por px por padrão');
});

// A cápsula de verdade: criada dentro do seletor com a cópia dos ícones, viaja até o botão marcado e desliga a
// animação ao chegar (requestAnimationFrame só enquanto se mexe).
const cellsOf = group => group.children?.[0]?.children?.[0]?.children?.[0]?.children?.[0]?.children;
test('a cápsula viaja até o segmento marcado e para de pedir quadros', () => {
  const { start } = require('../dist/modules/glass-segment.js');
  const frames = [], vars = {}, listeners = {};
  let mutated = null, now = 0;
  const node = () => {
    const self = { className: '', children: [], style: { setProperty(name, value) { self.vars[name] = value; } }, vars: {}, attrs: {},
      setAttribute(name, value) { self.attrs[name] = value; }, append(...items) { self.children.push(...items); },
      cloneNode: () => node(), querySelector: () => null, offsetWidth: 0, offsetHeight: 0 };
    return self;
  };
  let pressed = 0;
  const buttons = [0, 1, 2, 3].map(index => ({ ...node(), offsetLeft: 3 + index * 56, offsetTop: 3, offsetWidth: 54, offsetHeight: 36,
    getAttribute: name => (name === 'aria-pressed' ? String(index === pressed) : null), querySelector: () => node(), click() { pressed = index; mutated?.(); } }));
  const group = { ...node(), dataset: {}, querySelectorAll: () => buttons, addEventListener(type, handler) { listeners[type] = handler; },
    style: { setProperty(name, value) { vars[name] = value; } }, setPointerCapture() {} };
  const root = {
    PointerEvent: function () {},
    document: { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [group], createElement: node },
    MutationObserver: function (callback) { this.observe = () => { mutated = callback; }; },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    cancelAnimationFrame() {},
    performance: { now: () => now },
    matchMedia: () => ({ matches: false }),
  };
  start(root);
  // 1.70.5: a primeira medida fica para o próximo quadro (antes da primeira pintura), não no DOMContentLoaded.
  assert.equal(cellsOf(group)?.[2]?.style.left, undefined, 'nada medido na hora');
  assert.equal(frames.length, 1, 'medida agendada para o próximo quadro');
  frames.shift()(now);
  const knob = group.children[0];
  assert.equal(knob.className, 'glass-knob');
  assert.equal(knob.attrs['aria-hidden'], 'true', 'a cápsula é decoração: os botões continuam sendo o controle');
  const cells = knob.children[0].children[0].children[0].children;
  assert.equal(cells.length, 4, 'uma cópia de ícone por botão');
  assert.equal(cells[2].style.left, '115px');
  assert.deepEqual(buttons.map(button => button.vars['--i']), ['0', '1', '2', '3']);
  assert.equal(vars['--seg'], '0');

  buttons[3].click();
  assert.equal(frames.length, 1, 'a troca agenda a animação');
  const seen = [];
  for (let i = 0; i < 240 && frames.length; i++) { now += 1000 / 60; frames.shift()(now); seen.push(Number(vars['--seg'])); }
  assert.equal(frames.length, 0, 'chegou: nenhum quadro pendente');
  assert.equal(vars['--seg'], '3'); assert.equal(vars['--knob-sx'], '1'); assert.equal(vars['--knob-sy'], '1');
  assert.ok(seen.some(value => value > 0.2 && value < 2.8), 'passou pelo caminho');
  assert.ok(seen.length < 80, `para em ${seen.length} quadros`);

  // Arrastar: a cápsula segue o dedo com atraso e, ao soltar, encaixa no segmento mais próximo.
  listeners.pointerdown({ pointerId: 1, clientX: 200, button: 0 });
  listeners.pointermove({ pointerId: 1, clientX: 200 - 120, preventDefault() {} });
  now += 1000 / 60; frames.shift()(now);
  const lagging = Number(vars['--seg']);
  assert.ok(lagging < 3 && lagging > 0.86, `atrasada atrás do dedo (${lagging})`);
  listeners.pointerup({ pointerId: 1, clientX: 200 - 120 });
  for (let i = 0; i < 240 && frames.length; i++) { now += 1000 / 60; frames.shift()(now); }
  assert.equal(vars['--seg'], '1');
  assert.equal(pressed, 1, 'o segmento sob o dedo foi escolhido pelo clique do próprio botão');
});

test('movimento reduzido: a cápsula encaixa direto, sem animação', () => {
  const { start } = require('../dist/modules/glass-segment.js');
  const vars = {}, frames = [];
  let mutated = null, pressed = 0;
  const buttons = [0, 1, 2].map(index => ({ offsetLeft: 3 + index * 46, offsetWidth: 44, getAttribute: () => String(index === pressed) }));
  const group = { dataset: {}, style: { setProperty(name, value) { vars[name] = value; } }, querySelectorAll: () => buttons, addEventListener() {} };
  start({
    PointerEvent: function () {},
    document: { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [group] },
    MutationObserver: function (callback) { this.observe = () => { mutated = callback; }; },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    matchMedia: () => ({ matches: true }),
  });
  frames.splice(0).forEach(frame => frame()); // a primeira medida (próximo quadro, 1.70.5)
  pressed = 2; mutated();
  assert.equal(vars['--seg'], '2');
  assert.equal(frames.length, 0);
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
