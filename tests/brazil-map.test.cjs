// Mapa do "Brasil agora": projeção a partir de lat/lon e contorno real. Estes testes pegam o bug da 1.64, em que as
// etiquetas ficavam em posições escritas à mão, longe das capitais (até 25% da largura do país).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const map = require('../dist/modules/brazil-map.js');
const outline = require('../dist/modules/brazil-outline.js');

function loadCapitals() {
  const context = vm.createContext({Intl, localStorage:{getItem:() => null, setItem() {}}}); context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/capitals.js'), 'utf8'), context);
  return vm.runInContext('CAPITALS', context);
}
const capitals = loadCapitals();
const projection = map.createProjection(outline.rings);
const land = map.projectRings(outline.rings, projection);
const byUf = uf => projection.project(capitals.find(city => city.uf === uf).lat, capitals.find(city => city.uf === uf).lon);
// Tolerância de costa do gerador (km) convertida para unidades do viewBox (1° de latitude = 111,32 km).
const coastUnits = outline.coastToleranceKm / 111.32 * projection.unitsPerDegree;

test('point-in-polygon: as 27 capitais projetadas caem dentro do contorno do Brasil', () => {
  const report = capitals.map(city => {
    const point = projection.project(city.lat, city.lon);
    return {name:city.name, inside:map.pointInRings(point, land), distance:map.distanceToRings(point, land)};
  });
  // Belém, Florianópolis, São Luís e Vitória ficam na orla: no Natural Earth 10m o ponto de referência cai
  // 0,4-1,5 km dentro d'água. Aceito até a tolerância do gerador (3 km, menos de meio pixel no celular).
  for (const item of report) assert.ok(item.inside || item.distance <= coastUnits, `${item.name} fora do Brasil (${item.distance.toFixed(2)} un.)`);
  const strict = report.filter(item => item.inside).length;
  assert.ok(strict >= 23, `${strict} de 27 estritamente dentro`);
});

test('ordem geográfica: oeste/leste, norte/sul e equador', () => {
  const [manausX] = byUf('AM'), [belemX] = byUf('PA');
  assert.ok(manausX < belemX, 'Manaus a oeste de Belém');
  assert.ok(byUf('RS')[1] > byUf('DF')[1], 'Porto Alegre ao sul de Brasília');
  const [, equatorY] = projection.project(0, -50);
  assert.ok(byUf('RR')[1] < equatorY, 'Boa Vista ao norte do equador');
  assert.ok(byUf('AP')[1] < equatorY && byUf('AM')[1] > equatorY, 'Macapá logo acima do equador, Manaus abaixo');
  assert.ok(byUf('AC')[0] < byUf('RO')[0] && byUf('RN')[0] > byUf('CE')[0], 'Rio Branco é a mais a oeste; Natal a leste de Fortaleza');
});

test('viewBox calculado do contorno: cabe Roraima e o Chuí, com as margens nomeadas', () => {
  const xs = land.flat().map(p => p[0]), ys = land.flat().map(p => p[1]);
  const {top, right, bottom, left} = map.MARGIN;
  assert.ok(Math.abs(Math.min(...xs) - left) < 1e-9 && Math.abs(Math.min(...ys) - top) < 1e-9, 'contorno encosta na margem de cima e na esquerda');
  assert.ok(Math.max(...xs) <= projection.width - right && Math.max(...xs) > projection.width - right - 1);
  assert.ok(Math.max(...ys) <= projection.height - bottom && Math.max(...ys) > projection.height - bottom - 1);
  // Monte Caburaí (RR, 5,27° N) e o Arroio Chuí (RS, 33,75° S) dentro da caixa.
  for (const [lat, lon] of [[5.27, -60.21], [-33.75, -53.37]]) {
    const [x, y] = projection.project(lat, lon);
    assert.ok(x > 0 && x < projection.width && y > 0 && y < projection.height, `${lat},${lon}`);
  }
  assert.ok(Math.abs(projection.lat0 - (-14.2)) < .2, 'paralelo padrão no meio do país');
  assert.equal(projection.viewBox, `0 0 ${projection.width} ${projection.height}`);
});

test('contorno SVG leve e coerente com o point-in-polygon', () => {
  const d = map.outlinePath(land);
  assert.ok(Buffer.byteLength(d) < 50 * 1024, `${Buffer.byteLength(d)} bytes`);
  assert.equal((d.match(/M/g) || []).length, outline.rings.length);
  assert.ok(map.pointInRings(projection.project(-10, -55), land), 'centro do Mato Grosso é terra');
  assert.ok(!map.pointInRings(projection.project(-10, -30), land), 'Atlântico não é terra');
  assert.ok(!map.pointInRings(projection.project(-25, -57), land), 'Paraguai não é Brasil');
});
