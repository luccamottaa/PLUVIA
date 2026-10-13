const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const eclipses = require('../dist/modules/eclipses.js');
const A = require('../dist/vendor/astronomy-2.1.19.min.js');

const iso = ms => new Date(ms).toISOString().slice(0, 16);

test('eclipse do Sol: só os visíveis da cidade, com a fração encoberta local', () => {
  const manaus = eclipses.nextSolar(A, -3.1, -60.02, Date.parse('2026-10-12T00:00Z'));
  assert.equal(manaus.kind, 'partial');
  assert.equal(iso(manaus.peak), '2027-02-06T16:45');
  assert.ok(manaus.obscuration > .05 && manaus.obscuration < .1, String(manaus.obscuration));
  // Depois dele, o anular de 26/01/2028 passa por Manaus: anel de fogo, ~85% do disco.
  const annular = eclipses.nextSolar(A, -3.1, -60.02, Date.parse('2027-03-01T00:00Z'));
  assert.equal(annular.kind, 'annular');assert.equal(iso(annular.peak), '2028-01-26T14:28');
  assert.ok(annular.obscuration > .8 && annular.obscuration < .9);
  assert.ok(annular.begin < annular.peak && annular.peak < annular.end);
  const portoAlegre = eclipses.nextSolar(A, -30.03, -51.23, Date.parse('2026-10-12T00:00Z'));
  assert.ok(portoAlegre.obscuration > .8, 'o mesmo eclipse de 2027 cobre ~83% do Sol em Porto Alegre');
});

test('eclipse da Lua: sem penumbral e só com a Lua acima do horizonte', () => {
  const first = eclipses.nextLunar(A, -3.1, -60.02, Date.parse('2026-10-12T00:00Z'));
  assert.equal(first.kind, 'partial', 'os penumbrais de 2027 ficam de fora');
  assert.equal(iso(first.peak), '2028-01-12T04:13');
  // O total de 31/12/2028 acontece com a Lua abaixo do horizonte no Brasil: o próximo é o de 2029.
  const total = eclipses.nextLunar(A, -3.1, -60.02, Date.parse('2028-02-01T00:00Z'));
  assert.equal(total.kind, 'total');assert.equal(iso(total.peak), '2029-06-26T03:22');
  assert.ok(total.totalMinutes > 90 && total.totalMinutes < 110, String(total.totalMinutes));
});

test('resultado por cidade e dia: calcula uma vez, coordenada inválida não pede nada', async () => {
  const city = {id:'1302603', lat:-3.1, lon:-60.02}, at = Date.parse('2026-10-12T15:00Z');
  assert.equal(eclipses.peek(city, at), undefined);
  const first = await eclipses.request(city, at, {library:A});
  assert.equal(eclipses.peek(city, at), first);
  assert.equal(await eclipses.request(city, at + 3600000, {library:{}}), first, 'mesmo dia não recalcula');
  assert.equal(await eclipses.request({id:'x', lat:'abc', lon:1}, at, {library:A}), null);
});

test('biblioteca carrega uma vez, sob demanda, pelo caminho da raiz; falha permite tentar de novo', async () => {
  const source = fs.readFileSync('dist/modules/eclipses.js', 'utf8');
  const appended = [];
  const scope = {document:{head:{append(script) { appended.push(script); }}, createElement:() => ({})}};
  scope.globalThis = scope;
  vm.runInNewContext(source, scope);
  const api = scope.PLUVIA.eclipses;
  const one = api.load(), two = api.load();
  assert.equal(appended.length, 1);assert.equal(appended[0].src, '/vendor/astronomy-2.1.19.min.js?v=astronomy-2.1.19');
  appended[0].onerror();
  await assert.rejects(one);await assert.rejects(two);
  const retry = api.load();assert.equal(appended.length, 2, 'depois de uma falha, o próximo pedido tenta de novo');
  scope.Astronomy = A;appended[1].onload();
  assert.equal(await retry, A);
  assert.equal(await api.load(), A);assert.equal(appended.length, 2);
});

test('a biblioteca não entra na abertura nem no precache; o módulo e a licença acompanham', () => {
  const html = fs.readFileSync('dist/index.html', 'utf8'), sw = fs.readFileSync('dist/sw.js', 'utf8');
  assert.doesNotMatch(html, /astronomy-2\.1\.19/);assert.doesNotMatch(sw, /astronomy-2\.1\.19/);
  assert.match(html, /modules\/eclipses\.js\?v=eclipses-1/);assert.match(sw, /modules\/eclipses\.js\?v=eclipses-1/);
  assert.match(fs.readFileSync('dist/vendor/astronomy-LICENSE', 'utf8'), /MIT License/);
  assert.match(html, /Astronomy Engine<\/a> \(MIT\)/);
});
