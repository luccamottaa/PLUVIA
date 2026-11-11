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
  const custom = layout.normalize({order:['sky', 'week', 'summary', 'hourly', 'details', 'radar']}); // 'summary' e 'week' (cartões que saíram ou entraram em outro) são ignorados
  // 'tips' (dicas) não estava na ordem salva: entra no fim, na coluna da esquerda.
  assert.deepEqual(layout.columns(custom), {left:['hourly', 'radar', 'tips'], right:['sky', 'details']});
});

test('todas as seções configuráveis existem no HTML da Home', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  for (const section of layout.SECTIONS) {
    if (section.selector.startsWith('#')) assert.match(html, new RegExp(`id="${section.selector.slice(1)}"`), section.id);
    else assert.match(html, new RegExp(`<section class="[^"]*\\b${section.selector.split('.')[1]}\\b`), section.id);
  }
  assert.match(html, /id="homeLayoutDialog"/);
  assert.match(html, /modules\/home-layout\.js\?v=/);
});

test('dobra: as seções de detalhe do fim da ordem ficam atrás de "Mais detalhes"', () => {
  assert.deepEqual(layout.folded(layout.normalize(null)), ['details', 'radar', 'sky']);
  // Escondidas não contam: nem como recolhidas, nem como a seção que segura a dobra.
  assert.deepEqual(layout.folded(layout.normalize({hidden:['radar']})), ['details', 'sky']);
  assert.deepEqual(layout.folded(layout.normalize({hidden:['details', 'radar', 'sky']})), []);
});

test('dobra respeita a ordem escolhida: detalhe posto antes das horas continua à vista', () => {
  const radarFirst = layout.normalize({order:['radar', 'hourly', 'tips', 'details', 'sky']});
  assert.deepEqual(layout.folded(radarFirst), ['details', 'sky']);
  const hourlyLast = layout.normalize({order:['details', 'radar', 'sky', 'tips', 'hourly']});
  assert.deepEqual(layout.folded(hourlyLast), []);
});

test('dobra nunca deixa a Home só com o botão', () => {
  assert.deepEqual(layout.folded(layout.normalize({hidden:['hourly', 'tips']})), []);
});

test('o botão da dobra diz o que está recolhido, na ordem da tela', () => {
  assert.equal(layout.foldHint(['details', 'radar', 'sky']), 'Vento, UV e ar · Radar · Sol e Lua');
  assert.equal(layout.foldHint(['sky']), 'Sol e Lua');
  assert.equal(layout.foldHint([]), '');
});

test('botão "Mais detalhes" existe na Home, fechado, antes das leituras, e as recolhidas saem do layout', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../dist/continuous.css'), 'utf8');
  assert.match(html, /<button id="homeMore" class="home-more" type="button" aria-expanded="false" hidden>/);
  assert.ok(html.indexOf('id="homeMore"') < html.indexOf('<section class="metrics"'));
  assert.ok(html.indexOf('id="homeMore"') > html.indexOf('id="tips"'));
  assert.ok(html.includes(`<small class="home-more-hint">${layout.foldHint(layout.folded(layout.normalize(null)))}</small>`));
  assert.match(css, /#weatherView \[data-home-folded\] \{ display:none !important; \}/);
});

// DOM mínimo para o mount: só o que home-layout.js usa.
function fakeHome({wide = false, stored = {}} = {}) {
  const view = {children:[], id:'weatherView'};
  const make = (name, extra = {}) => {
    const attrs = new Map(), listeners = {};
    const node = {name, hidden:false, dataset:{}, parent:view, textContent:'',
      hasAttribute:key => attrs.has(key), getAttribute:key => attrs.get(key) ?? null, setAttribute:(key, value) => attrs.set(key, String(value)),
      toggleAttribute:(key, on) => { if (on) attrs.set(key, ''); else attrs.delete(key); },
      addEventListener:(type, handler) => { listeners[type] = handler; }, fire:type => listeners[type]?.({target:node}),
      get nextElementSibling() { return view.children[view.children.indexOf(node) + 1] || null; },
      after(other) { view.children.splice(view.children.indexOf(other), 1); view.children.splice(view.children.indexOf(node) + 1, 0, other); },
      scrollIntoView() { node.scrolled = (node.scrolled || 0) + 1; }, querySelector:selector => node.parts?.[selector] || null, ...extra};
    return node;
  };
  const byName = {};
  for (const name of ['#alertNudge', 'section.hourly-peek', '#tips', '#homeMore', 'section.metrics', 'section.weather-map-section', 'section.sun-section']) view.children.push(byName[name] = make(name));
  byName['#homeMore'].hidden = true;
  byName['#homeMore'].parts = {'.home-more-label':make('label'), '.home-more-hint':make('hint')};
  view.querySelector = selector => byName[selector.replace(':scope > ', '')] || null;
  Object.defineProperty(view, 'firstElementChild', {get:() => view.children[0]});
  Object.defineProperty(view, 'lastElementChild', {get:() => view.children.at(-1)});
  view.append = node => { view.children.splice(view.children.indexOf(node), 1); view.children.push(node); };
  const store = new Map(Object.entries(stored)), events = [];
  const root = {
    document:{getElementById:id => id === 'weatherView' ? view : id === 'homeMore' ? byName['#homeMore'] : null,
      createElement:() => { const el = make('div'); el.children = []; el.append = (...nodes) => el.children.push(...nodes); el.remove = () => {}; el.querySelector = () => ({children:[], insertBefore() {}}); return el; }},
    localStorage:{getItem:key => store.has(key) ? store.get(key) : null, setItem:(key, value) => store.set(key, String(value)), removeItem:key => store.delete(key)},
    matchMedia:() => ({matches:wide, addEventListener() {}}),
    dispatchEvent:event => events.push(event), CustomEvent:globalThis.CustomEvent
  };
  return {root, view, byName, store, events, names:() => view.children.map(node => node.name)};
}
const FOLDABLE = ['section.metrics', 'section.weather-map-section', 'section.sun-section'];

test('no celular a Home abre recolhida, sem mexer na ordem do HTML; o toque abre, guarda e fecha de novo', () => {
  const home = fakeHome(), before = home.names();
  layout.mount(home.root);
  const more = home.byName['#homeMore'];
  assert.deepEqual(home.names(), before);
  assert.equal(more.hidden, false);
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  assert.equal(more.parts['.home-more-label'].textContent, 'Mais detalhes');
  for (const name of FOLDABLE) assert.equal(home.byName[name].hasAttribute('data-home-folded'), true, name);
  assert.equal(home.byName['section.hourly-peek'].hasAttribute('data-home-folded'), false);

  more.fire('click');
  assert.equal(more.getAttribute('aria-expanded'), 'true');
  assert.equal(more.parts['.home-more-label'].textContent, 'Menos detalhes');
  assert.equal(home.store.get(layout.MORE_KEY), '1');
  for (const name of FOLDABLE) assert.equal(home.byName[name].hasAttribute('data-home-folded'), false, name);
  assert.equal(home.events.at(-1).detail.expanded, true);

  more.fire('click');
  assert.equal(home.store.has(layout.MORE_KEY), false);
  assert.equal(more.scrolled, 1);
  for (const name of FOLDABLE) assert.equal(home.byName[name].hasAttribute('data-home-folded'), true, name);
});

test('quem já abriu os detalhes neste aparelho continua vendo tudo', () => {
  const home = fakeHome({stored:{'pluvia-home-more':'1'}});
  layout.mount(home.root);
  assert.equal(home.byName['#homeMore'].getAttribute('aria-expanded'), 'true');
  for (const name of FOLDABLE) assert.equal(home.byName[name].hasAttribute('data-home-folded'), false, name);
});

test('reveal abre os detalhes só nesta visita (atalho do radar), sem gravar a escolha', () => {
  const home = fakeHome();
  layout.mount(home.root);
  layout.reveal('hourly');
  assert.equal(home.byName['section.weather-map-section'].hasAttribute('data-home-folded'), true);
  layout.reveal('radar');
  assert.equal(home.byName['section.weather-map-section'].hasAttribute('data-home-folded'), false);
  assert.equal(home.store.has(layout.MORE_KEY), false);
});

test('no desktop largo não há dobra nem botão', () => {
  const home = fakeHome({wide:true});
  layout.mount(home.root);
  assert.equal(home.byName['#homeMore'].hidden, true);
  for (const name of FOLDABLE) assert.equal(home.byName[name].hasAttribute('data-home-folded'), false, name);
});