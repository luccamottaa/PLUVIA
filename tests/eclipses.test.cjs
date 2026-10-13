const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
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
  assert.match(html, /modules\/eclipses\.js\?v=eclipses-2/);assert.match(sw, /modules\/eclipses\.js\?v=eclipses-2/);
  assert.match(fs.readFileSync('dist/vendor/astronomy-LICENSE', 'utf8'), /MIT License/);
  assert.match(html, /Astronomy Engine<\/a> \(MIT\)/);
});

test('ilustração: a Lua cobre exatamente a fração calculada e o anular vira anel no centro',()=>{
  const e=require('../dist/modules/eclipses.js');
  for(const f of [.01,.075,.5,.83,.99]){const d=e.distanceFor(f,1);assert.ok(Math.abs(e.overlapFraction(d,1)-f)<1e-4,f);}
  assert.equal(e.overlapFraction(3,1),0);
  assert.equal(e.overlapFraction(0,.9),.81);
  const annular=e.figureModel('solar',{kind:'annular',obscuration:.85});
  assert.equal(annular.to,0);assert.ok(Math.abs(annular.r*annular.r-.85)<1e-9);
  assert.deepEqual(e.figureModel('solar',{kind:'total',obscuration:1}).to,0);
  const partial=e.figureModel('solar',{kind:'partial',obscuration:.075});
  assert.ok(Math.abs(e.overlapFraction(-partial.to,1)-.075)<1e-4);
  assert.ok(partial.from<partial.to,'entra pela esquerda e para na fração');
  const lunar=e.figureModel('lunar',{kind:'partial',obscuration:.3});
  assert.ok(Math.abs(e.overlapFraction(-lunar.to,2.6)-.3)<1e-4);
  assert.equal(e.figureModel('lunar',{kind:'total'}).tone,'total');
});
test('ilustração: SVG aria-hidden, sem HTML montado, com o ponto inicial e final no estilo',()=>{
  const e=require('../dist/modules/eclipses.js');
  const node=name=>({name,attrs:{},children:[],style:{props:{},setProperty(k,v){this.props[k]=v;}},setAttribute(k,v){this.attrs[k]=v;},append(...c){this.children.push(...c);}});
  const doc={createElementNS:(ns,name)=>{assert.equal(ns,'http://www.w3.org/2000/svg');return node(name);}};
  const svg=e.figure(doc,'lunar',{kind:'total',obscuration:1});
  assert.equal(svg.attrs['aria-hidden'],'true');assert.equal(svg.attrs['data-tone'],'total');
  const all=[];(function walk(n){all.push(n);n.children.forEach(walk);})(svg);
  assert.ok(all.some(n=>n.name==='use'&&n.attrs.href==='#pluviaMoonSurface'),'reaproveita a textura da Lua');
  const mover=all.find(n=>String(n.attrs.class).includes('eclipse-mover'));
  assert.match(mover.style.props['--eclipse-from'],/^-\d+\.\d+px$/);assert.match(mover.style.props['--eclipse-to'],/^-\d+\.\d+px$/);
  const css=fs.readFileSync(path.join(__dirname,'..','dist','continuous.css'),'utf8');
  assert.match(css,/@media \(prefers-reduced-motion:reduce\) \{ #weatherView \.eclipse-figure\[data-play\] \.eclipse-mover \{ animation:none; \} \}/);
  const app=fs.readFileSync(path.join(__dirname,'..','dist','app.js'),'utf8');
  assert.match(app,/if\(row\.dataset\.figure===key\) return;/,'o relógio não refaz a ilustração');
});
