const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const layout = require('../dist/modules/home-layout.js');

const IDS = layout.SECTIONS.map(section => section.id);

test('escolha ausente ou inválida volta à ordem padrão, sem esconder nada', () => {
  for (const saved of [null, undefined, {}, {order:'x', hidden:3}, {order:[1, null]}]) {
    assert.deepEqual(layout.normalize(saved), {order:IDS, hidden:[]});
  }
});

test('ids desconhecidos/repetidos saem e seções novas entram no fim', () => {
  const result = layout.normalize({order:['sky', 'radar', 'sky', 'antigo'], hidden:['radar', 'radar', 'antigo']});
  assert.deepEqual(result.order.slice(0, 2), ['sky', 'radar']);
  assert.deepEqual([...result.order].sort(), [...IDS].sort());
  assert.deepEqual(result.hidden, ['radar']);
});

test('pelo menos uma seção continua visível', () => {
  assert.equal(layout.normalize({hidden:IDS}).hidden.length, IDS.length - 1);
  let current = layout.normalize(null);
  for (const id of IDS) current = layout.setVisible(current, id, false);
  assert.equal(current.hidden.length, IDS.length - 1);
  current = layout.setVisible(current, current.hidden[0], true);
  assert.equal(current.hidden.length, IDS.length - 2);
});

test('mover troca vizinhos e ignora as pontas', () => {
  const start = layout.normalize(null);
  assert.deepEqual(layout.move(start, IDS[0], -1), start);
  assert.deepEqual(layout.move(start, IDS.at(-1), 1), start);
  assert.deepEqual(layout.move(start, IDS[1], -1).order.slice(0, 2), [IDS[1], IDS[0]]);
  assert.deepEqual(layout.move(start, 'nada', 1), start);
});

test('colunas do desktop mantêm cada seção do seu lado, na ordem escolhida', () => {
  const custom = layout.normalize({order:['sky', 'week', 'summary', 'hourly', 'details', 'radar']}); // 'summary' (cartão retirado) é ignorado
  assert.deepEqual(layout.columns(custom), {left:['week', 'hourly', 'radar'], right:['sky', 'details']});
});

test('todas as seções configuráveis existem no HTML da Home', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  for (const section of layout.SECTIONS) {
    const className = section.selector.split('.')[1];
    assert.match(html, new RegExp(`<section class="[^"]*\\b${className}\\b`), section.id);
  }
  assert.match(html, /id="homeLayoutDialog"/);
  assert.match(html, /modules\/home-layout\.js\?v=/);
});
