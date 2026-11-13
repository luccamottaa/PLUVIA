const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function load() {
  const data = {}, events = [];
  global.localStorage = {getItem:k => data[k] ?? null, setItem:(k, v) => { data[k] = String(v); }, removeItem:k => { delete data[k]; }};
  global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  global.dispatchEvent = event => events.push(event);
  delete require.cache[require.resolve('../dist/modules/exact-location.js')];
  return {exact:require('../dist/modules/exact-location.js'), data, events};
}
const manaus = {id:'1302603', name:'Manaus', uf:'AM', lat:-3.1019, lon:-60.025, timezone:'America/Manaus'};

test('desligada por padrão; ligar e desligar avisa o app e desligar apaga o ponto do aparelho', () => {
  const {exact, data, events} = load();
  assert.equal(exact.enabled(), false);
  exact.setEnabled(true);
  assert.equal(exact.enabled(), true);
  exact.remember(manaus.id, -3.0456, -60.0123, Date.now());
  assert.ok(data[exact.POINT_KEY]);
  exact.setEnabled(false);
  assert.equal(data[exact.POINT_KEY], undefined);
  assert.deepEqual(events.map(e => e.detail.on), [true, false]);
});

test('o ponto guardado tem só duas casas decimais (~1 km), nunca a posição exata', () => {
  const {exact, data} = load();
  const point = exact.remember(manaus.id, -3.045678, -60.012345, 1000);
  assert.deepEqual(point, {id:'1302603', lat:-3.05, lon:-60.01, at:1000});
  assert.doesNotMatch(data[exact.POINT_KEY], /045678|012345/);
});

test('ponto vale só para a mesma cidade e por 24 h', () => {
  const {exact} = load();
  const now = Date.parse('2026-11-13T12:00:00Z');
  exact.remember(manaus.id, -3.05, -60.01, now);
  assert.ok(exact.pointFor(manaus.id, now + 3600000));
  assert.equal(exact.pointFor('2611606', now), null, 'outra cidade');
  assert.equal(exact.pointFor(manaus.id, now + exact.MAX_AGE_MS + 1), null, 'mais de 24 h');
});

test('apply troca as coordenadas e guarda o centro do município; reference devolve o centro', () => {
  const {exact} = load();
  const city = exact.apply(manaus, {id:manaus.id, lat:-3.05, lon:-60.01, at:1});
  assert.equal(city.lat, -3.05); assert.equal(city.lon, -60.01); assert.equal(city.exact, true);
  assert.deepEqual(exact.reference(city), {lat:manaus.lat, lon:manaus.lon});
  assert.deepEqual(exact.reference(manaus), {lat:manaus.lat, lon:manaus.lon});
  assert.equal(exact.apply(manaus, {id:'2611606', lat:-8, lon:-35, at:1}), manaus, 'ponto de outra cidade não se aplica');
  const again = exact.apply(city, {id:manaus.id, lat:-3.06, lon:-60.02, at:2});
  assert.deepEqual(again.ref, {lat:manaus.lat, lon:manaus.lon}, 'o centro não vira o ponto anterior');
});

test('servidor só recebe o ponto de novo ao mudar de cidade ou andar mais de 2 km', () => {
  const {exact} = load();
  const point = {id:manaus.id, lat:-3.05, lon:-60.01, at:1};
  assert.equal(exact.needsSync(point, null), true);
  exact.markSynced(point);
  assert.equal(exact.needsSync({...point, lat:-3.06}), false, '~1,1 km');
  assert.equal(exact.needsSync({...point, lat:-3.08}), true, '~3,3 km');
  assert.equal(exact.needsSync({...point, id:'1302405'}), true, 'outra cidade');
  exact.markSynced(null);
  assert.equal(exact.synced(), null);
});

test('app e avisos usam o ponto só onde devem', () => {
  const app = fs.readFileSync('dist/app.js', 'utf8'), push = fs.readFileSync('dist/notifications.js', 'utf8');
  const html = fs.readFileSync('dist/index.html', 'utf8');
  assert.match(app, /city = exactSpot\(city\);/, 'chooseCity aplica o ponto depois de carregar os detalhes da cidade');
  assert.match(app, /const center = city\.ref \|\| city;\s*writePreference\("pluvia-city-record"/, 'o registro da cidade guarda o centro, não o ponto');
  assert.match(push, /const center = activeCity\.ref \|\| activeCity;/, 'cidade de aviso usa o centro do município');
  assert.ok(html.indexOf('modules/exact-location.js') < html.indexOf('./app.js?v='), 'módulo carrega antes do app');
  assert.match(html, /id="exactLocation"[^>]*aria-pressed="false"/);
});

test('métrica da opção: só ligado/desligado, na allowlist', () => {
  const {exact} = load();
  const tracked = [], listeners = {};
  const button = {attrs:{}, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(type, fn) { listeners[type] = fn; }};
  global.pluviaAnalytics = {track:(name, props) => tracked.push([name, props])};
  global.addEventListener = () => {};
  global.document = {readyState:'complete', getElementById:id => id === 'exactLocation' ? button : null};
  delete require.cache[require.resolve('../dist/modules/exact-location.js')];
  require('../dist/modules/exact-location.js');
  listeners.click(); listeners.click();
  assert.deepEqual(tracked, [['Exact Location Toggled', {state:'on'}], ['Exact Location Toggled', {state:'off'}]]);
  delete global.document; delete global.pluviaAnalytics;
  const analytics = fs.readFileSync('dist/analytics.js', 'utf8');
  assert.match(analytics, /'Exact Location Toggled'/); assert.match(analytics, /state:new Set\(\['on','off'\]\)/);
  assert.ok(exact);
});
