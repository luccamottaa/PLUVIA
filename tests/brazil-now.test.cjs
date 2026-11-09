const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const brazil = require('../dist/modules/brazil-now.js');
const map = require('../dist/modules/brazil-map.js');
const outline = require('../dist/modules/brazil-outline.js');

const cities = [
  {id:'1302603', name:'Manaus', uf:'AM', lat:-3.119, lon:-60.022, timezone:'America/Manaus'},
  {id:'4314902', name:'Porto Alegre', uf:'RS', lat:-30.035, lon:-51.218, timezone:'America/Sao_Paulo'},
  {id:'1501402', name:'Belém', uf:'PA', lat:-1.456, lon:-48.504, timezone:'America/Belem'}
];
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('uma única URL com coordenadas e fusos na ordem das capitais', () => {
  const url = new URL(brazil.buildUrl(cities));
  assert.equal(url.hostname, 'api.open-meteo.com');
  assert.equal(url.searchParams.get('latitude'), '-3.119,-30.035,-1.456');
  assert.equal(url.searchParams.get('longitude'), '-60.022,-51.218,-48.504');
  assert.equal(url.searchParams.get('timezone'), 'America/Manaus,America/Sao_Paulo,America/Belem');
  assert.equal(url.searchParams.get('forecast_days'), '1');
});

test('cada capital é validada sozinha; ausentes viram null, nunca zero', () => {
  const rows = brazil.parse([
    {current:{temperature_2m:31.4, weather_code:2, is_day:1}, daily:{temperature_2m_max:[34], temperature_2m_min:[24]}},
    {current:{temperature_2m:null, weather_code:3, is_day:0}, daily:{}},
    {current:{temperature_2m:'quente', weather_code:500}, daily:{temperature_2m_max:[33.2], temperature_2m_min:[25]}}
  ], cities);
  assert.deepEqual(rows.map(row => [row.name, row.temperature, row.code, row.high, row.low]), [
    ['Manaus', 31.4, 2, 34, 24], ['Porto Alegre', null, 3, null, null], ['Belém', null, null, 33.2, 25]
  ]);
  assert.equal(rows[1].isDay, false);
  assert.throws(() => brazil.parse([{}], cities), /incompleta/, 'lista de tamanho diferente é rejeitada');
  assert.throws(() => brazil.parse({error:true}, cities), /incompleta/);
});

test('agrupa por região na ordem Norte → Sul, com capitais em ordem alfabética', () => {
  const groups = brazil.group(cities.map(city => ({...city})));
  assert.deepEqual(groups.map(group => [group.name, group.rows.map(row => row.name)]), [['Norte', ['Belém', 'Manaus']], ['Sul', ['Porto Alegre']]]);
  const all = new Set(brazil.REGIONS.flatMap(([, ufs]) => ufs));
  assert.equal(all.size, 27, 'as 27 unidades federativas têm região');
});

test('cor pela escala de 5° a 37°; ausente sem cor', () => {
  assert.equal(brazil.tempColor(null), null);
  assert.equal(brazil.tempColor(NaN), null);
  assert.equal(brazil.tempColor(-3), brazil.tempColor(5), 'abaixo da escala fica no azul');
  assert.equal(brazil.tempColor(45), brazil.tempColor(37), 'acima da escala fica no vermelho');
  assert.equal(brazil.tempColor(5), 'rgb(91,140,255)');
  assert.equal(brazil.tempColor(37), 'rgb(229,83,61)');
  assert.notEqual(brazil.tempColor(20), brazil.tempColor(34));
  // A legenda do CSS usa as mesmas paradas.
  assert.match(read('dist/continuous.css'), /\.brazil-legend i \{[^}]*rgb\(91,140,255\) 0%[^}]*rgb\(229,83,61\) 100%/);
});

test('mapa e lista saem das mesmas linhas: "—" sem dado, nada pulado nem inventado', () => {
  const rows = brazil.parse([
    {current:{temperature_2m:30.4, weather_code:1, is_day:1}, daily:{}},
    {current:{temperature_2m:null, weather_code:3, is_day:1}, daily:{}},
    {current:{temperature_2m:27.6, weather_code:1, is_day:1}, daily:{}}
  ], cities);
  const pins = brazil.pins(rows);
  assert.deepEqual(pins.map(pin => [pin.id, pin.text]), [['1501402', '28°'], ['1302603', '30°'], ['4314902', '—']], 'norte → sul');
  assert.equal(pins.find(pin => pin.text === '—').color, null);
  assert.equal(pins[0].label, 'Belém/PA: 28 graus. Abrir cidade');
  assert.equal(pins[2].label, 'Porto Alegre/RS: temperatura indisponível. Abrir cidade');
  for (const pin of pins) {
    const row = rows.find(item => item.id === pin.id);
    assert.deepEqual([pin.lat, pin.lon], [row.lat, row.lon], 'o pino usa a coordenada da própria linha');
  }
  // Falha total: as mesmas capitais, todas sem leitura.
  const empty = brazil.emptyRows(cities);
  assert.equal(empty.length, cities.length);
  assert.ok(empty.every(row => row.temperature === null && row.high === null && row.low === null && row.code === null));
  assert.ok(brazil.pins(empty).every(pin => pin.text === '—' && pin.color === null));
});

test('"Atualizado às" sempre no horário de Brasília e dizendo isso', () => {
  assert.equal(brazil.STATUS_ZONE, 'America/Sao_Paulo');
  const at = Date.UTC(2026, 10, 9, 21, 22); // 18:22 em Brasília, 17:22 em Manaus
  const format = value => new Intl.DateTimeFormat('pt-BR', {hour:'2-digit', minute:'2-digit', timeZone:brazil.STATUS_ZONE}).format(value);
  assert.equal(brazil.statusText(at, format), 'Atualizado às 18:22 (horário de Brasília) · Open-Meteo');
  assert.doesNotMatch(read('dist/modules/brazil-now.js'), /activeCity\?\.timezone/, 'não usa mais o fuso da cidade aberta');
});

test('campo contínuo: interior entra na mesma consulta, ausentes ficam fora e o campo passa pelas leituras', () => {
  const extra = brazil.FIELD_POINTS.map((point, index) => ({current:{temperature_2m:index === 0 ? null : 25 + index % 5}}));
  const capitals = cities.map(() => ({current:{temperature_2m:30, weather_code:1, is_day:1}, daily:{}}));
  const {rows, extra:points} = brazil.split(capitals.concat(extra), cities);
  assert.equal(rows.length, 3);
  assert.equal(points.length, brazil.FIELD_POINTS.length);
  assert.equal(points[0].temperature, null, 'ausente não vira zero');
  assert.equal(brazil.split(capitals, cities).extra.length, 0, 'sem os pontos extras, só as capitais');
  assert.throws(() => brazil.split(capitals.slice(1), cities), /incompleta/);
  // Todos os pontos do interior caem dentro do contorno real.
  const projection = map.createProjection(outline.rings), land = map.projectRings(outline.rings, projection);
  for (const point of brazil.FIELD_POINTS) assert.ok(map.pointInRings(projection.project(point.lat, point.lon), land), `${point.lat},${point.lon}`);
  const grid = map.field([{lat:-3,lon:-60,temperature:20},{lat:-30,lon:-51,temperature:10},{lat:-1,lon:-48,temperature:30},
    {lat:-15,lon:-47,temperature:25},{lat:-8,lon:-35,temperature:28},{lat:-23,lon:-46,temperature:18},{lat:-9,lon:-67,temperature:null}], projection);
  assert.ok(grid);
  assert.equal(grid.height, Math.round(grid.width * projection.height / projection.width), 'grade com a proporção do viewBox');
  const values = [...grid.values];
  assert.ok(Math.min(...values) >= 10 && Math.max(...values) <= 30, 'média ponderada não sai da faixa das leituras');
  const at = (lat, lon) => {const [x, y] = projection.project(lat, lon); return grid.values[Math.floor(y / projection.height * grid.height) * grid.width + Math.floor(x / projection.width * grid.width)];};
  assert.ok(Math.abs(at(-30, -51) - 10) < 2, 'perto do ponto frio, frio');
  assert.ok(Math.abs(at(-1, -48) - 30) < 2, 'perto do ponto quente, quente');
  assert.equal(map.field([{lat:0,lon:-60,temperature:20}], projection), null, 'poucas leituras: sem campo');
});

test('mapa acessível e carregado só ao abrir o diálogo', () => {
  const html = read('dist/index.html'), src = read('dist/modules/brazil-now.js'), css = read('dist/continuous.css');
  const tag = html.match(/<div id="brazilMap"[^>]*>/)[0];
  assert.doesNotMatch(tag, /aria-hidden/, 'o mapa não é escondido do leitor de tela');
  assert.match(tag, /role="group"/); assert.match(tag, /aria-label="[^"]+"/); assert.match(tag, /aria-describedby="brazilMapHint"/);
  assert.match(html, /id="brazilMapHint"/);
  // Contorno e projeção não entram na abertura da Home: só via loadMapModules, ao abrir.
  const sw = read('dist/sw.js');
  for (const script of brazil.MAP_SCRIPTS) {
    assert.ok(!html.includes(script.split('?')[0]), `${script} fora do HTML`);
    assert.ok(sw.includes(`".${script}"`), `${script} no precache (mapa abre offline)`);
  }
  assert.match(src, /loadMapModules\(\)/);
  assert.match(css, /button\.brazil-chip::before|\.brazil-chip::before \{[^}]*height:44px/, 'área de toque de 44 px');
  assert.match(css, /@media \(prefers-reduced-motion:reduce\) \{ html body #brazilDialog #brazilMap button\.brazil-chip \{ transition:none; \} \}/);
});

// O bug da 1.64: etiquetas em posições de tela escritas à mão (LABELS) e um contorno colado no código, num mapa 3D.
test('sem posições de tela fixas, contorno embutido ou 3D', () => {
  const src = read('dist/modules/brazil-now.js'), css = read('dist/continuous.css');
  for (const name of ['LABELS', 'OUTLINE', 'MAP', 'project', 'spinFor', 'field']) assert.equal(brazil[name], undefined, `${name} saiu do módulo`);
  assert.doesNotMatch(src, /const (LABELS|OUTLINE) =|getBoundingClientRect|--spin|brazil-anchor/);
  assert.doesNotMatch(css, /brazil-plane|brazil-slab|brazil-anchor|preserve-3d[^}]*brazil/);
  // As posições do mapa saem só da projeção dos dados (lat/lon) e do layout das etiquetas.
  assert.doesNotMatch(read('dist/modules/brazil-map.js'), /\b(AM|PA|RJ|SP|RS):\s*\[\d/, 'nenhuma posição por UF');
});
