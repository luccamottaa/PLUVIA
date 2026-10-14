const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Módulo ES compartilhado das funções Supabase, carregado num VM como em forecast-verify.test.
const code = fs.readFileSync('supabase/functions/_shared/environment.js', 'utf8');
const names = [...code.matchAll(/^export (?:const|function) (\w+)/gm)].map(match => match[1]);
const context = vm.createContext({Date, Number, Math, Array, Error, JSON, Map, String});
const api = vm.runInContext(`(() => {\n${code.replace(/^export /gm, '')}\nreturn {${names.join(', ')}};\n})()`, context);

const now = Date.parse('2026-10-14T15:40:00Z');
// DataHora da ANA vem no horário de Brasília.
function row(local, level) { return `<DadosHidrometereologicos><CodEstacao>14990000</CodEstacao><DataHora>${local} </DataHora><Vazao /><Nivel>${level}</Nivel><Chuva>0.00</Chuva></DadosHidrometereologicos>`; }

test('estações: código ANA de 8 dígitos, IBGE de 7 e sem repetir cidade', () => {
  assert.ok(api.RIVER_STATIONS.every(s => /^\d{8}$/.test(s.code) && /^\d{7}$/.test(s.city) && s.river && s.place));
  assert.equal(new Set(api.RIVER_STATIONS.map(s => s.city)).size, api.RIVER_STATIONS.length);
  assert.equal(api.anaUrl('14990000', now), 'http://telemetriaws1.ana.gov.br/ServiceANA.asmx/DadosHidrometeorologicos?codEstacao=14990000&dataInicio=12/10/2026&dataFim=14/10/2026');
  assert.throws(() => api.anaUrl('1499&x=1', now), /invalid_station/);
});

test('cota: mediana da última hora, variação contra 24 h antes e horário de Brasília', () => {
  const xml = [row('2026-10-14 11:45:00', '1749.00'), row('2026-10-14 11:30:00', '1751.00'), row('2026-10-14 11:15:00', '1749.00'),
    row('2026-10-14 11:00:00', '1750.00'), row('2026-10-13 11:45:00', '1757.00'), row('2026-10-13 11:30:00', '1758.00'), row('2026-10-13 12:00:00', '1757.00')].join('');
  assert.deepEqual(JSON.parse(JSON.stringify(api.parseAna(xml, now))), {at:'2026-10-14T14:45:00.000Z', levelCm:1750, change24hCm:-7});
});

test('cota: sem leitura de 24 h antes a variação fica null; leitura velha ou vazia some', () => {
  assert.equal(api.parseAna(row('2026-10-14 11:45:00', '1749.00'), now).change24hCm, null);
  assert.equal(api.parseAna(row('2026-10-13 20:00:00', '1749.00'), now), null);
  assert.equal(api.parseAna(row('2026-10-14 11:45:00', ''), now), null);
  assert.equal(api.parseAna('', now), null);
  assert.equal(api.parseAna(null, now), null);
});

test('focos: URLs de ontem e hoje em UTC', () => {
  assert.deepEqual([...api.inpeUrls(now)].map(url => url.slice(-12)), ['20261013.csv', '20261014.csv']);
});

test('focos: o mesmo fogo visto várias vezes conta uma vez; velhos e fora do Brasil ficam de fora', () => {
  const head = 'id,lat,lon,data_hora_gmt,satelite,municipio,estado,pais,municipio_id,estado_id,pais_id,numero_dias_sem_chuva,precipitacao,risco_fogo,bioma,frp\n';
  const line = (lat, lon, at) => `x,${lat},${lon},${at},GOES-19,M,E,Brasil,1,1,33,,,,Amazônia,1\n`;
  const today = head + line('  -3.201200', ' -60.101000', '2026-10-14 14:40:00') + line('  -3.201900', ' -60.100600', '2026-10-14 14:30:00')
    + line('  -3.400000', ' -60.500000', '2026-10-14 09:00:00') + line('   .446500', ' -60.544200', '2026-10-14 10:00:00')
    + line('  40.0', ' 10.0', '2026-10-14 10:00:00') + line('  -3.2', ' -60.1', 'quebrado');
  const yesterday = head + line('  -5.000000', ' -61.000000', '2026-10-13 15:00:00') + line('  -5.500000', ' -61.000000', '2026-10-13 16:00:00');
  const result = api.parseFires([yesterday, today, 'lixo'], now);
  assert.equal(result.count, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(result.cells['-4,-61'])), [[-3.201, -60.101, Date.parse('2026-10-14T14:40:00Z') / 60000], [-3.4, -60.5, Date.parse('2026-10-14T09:00:00Z') / 60000]]);
  assert.deepEqual(Object.keys(result.cells).sort(), ['-4,-61', '-6,-61', '0,-61']);
});
