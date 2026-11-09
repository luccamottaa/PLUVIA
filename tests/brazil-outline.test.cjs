// Dados do mapa do "Brasil agora": coordenadas das capitais (fonte única: dist/capitals.js) e o contorno gerado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const outline = require('../dist/modules/brazil-outline.js');

function loadCapitals() {
  const context = vm.createContext({Intl, localStorage:{getItem:() => null, setItem() {}}}); context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/capitals.js'), 'utf8'), context);
  return vm.runInContext('CAPITALS', context);
}

// Lista de referência conferida pelo dono (novembro/2026), sede de cada capital.
const REFERENCE = {
  PA:[-1.455, -48.490], RR:[2.820, -60.673], AP:[0.034, -51.066], AM:[-3.119, -60.022], TO:[-10.184, -48.333],
  RO:[-8.761, -63.900], AC:[-9.975, -67.810], PI:[-5.089, -42.802], MA:[-2.530, -44.303], CE:[-3.732, -38.527],
  RN:[-5.795, -35.209], PB:[-7.115, -34.863], PE:[-8.047, -34.877], AL:[-9.666, -35.735], SE:[-10.947, -37.073],
  BA:[-12.971, -38.501], MG:[-19.920, -43.938], ES:[-20.315, -40.312], RJ:[-22.907, -43.173], SP:[-23.550, -46.633],
  PR:[-25.428, -49.273], SC:[-27.595, -48.548], RS:[-30.035, -51.218], MS:[-20.470, -54.620], MT:[-15.601, -56.097],
  GO:[-16.686, -49.264], DF:[-15.794, -47.882]
};
// 0,05° ≈ 5,5 km: a diferença entre "centro da sede" de duas fontes; um erro de digitação (sinal, dígito) passa disso.
const MAX_DIFF_DEGREES = .05;

test('as 27 capitais batem com a lista de referência', () => {
  const capitals = loadCapitals();
  assert.equal(capitals.length, 27);
  assert.deepEqual(new Set(capitals.map(city => city.uf)), new Set(Object.keys(REFERENCE)));
  for (const city of capitals) {
    const [lat, lon] = REFERENCE[city.uf];
    assert.ok(Math.abs(city.lat - lat) <= MAX_DIFF_DEGREES && Math.abs(city.lon - lon) <= MAX_DIFF_DEGREES,
      `${city.name}: ${city.lat},${city.lon} × referência ${lat},${lon}`);
  }
});

test('contorno gerado: leve, anéis válidos dentro do Brasil e com a fonte declarada', () => {
  const bytes = fs.statSync(path.join(__dirname, '../dist/modules/brazil-outline.js')).size;
  assert.ok(bytes < 50 * 1024, `brazil-outline.js com ${bytes} bytes`);
  assert.match(outline.source, /Natural Earth 1:10m/);
  assert.ok(outline.rings.length >= 1 && Object.isFrozen(outline));
  for (const ring of outline.rings) {
    assert.ok(ring.length % 2 === 0 && ring.length >= 8, 'pares lon/lat, pelo menos 4 pontos');
    for (let i = 0; i < ring.length; i += 2) {
      const [lon, lat] = [ring[i], ring[i + 1]];
      // Caixa do Brasil continental (Natural Earth): -74,0 a -34,7 de longitude, 5,3 a -33,8 de latitude.
      assert.ok(lon > -74.1 && lon < -28.8 && lat > -33.9 && lat < 5.4, `${lon},${lat}`);
    }
  }
  // O continente vem primeiro e é, de longe, o maior anel.
  assert.ok(outline.rings[0].length > 10 * outline.rings[1].length);
});
