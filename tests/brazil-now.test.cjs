const test = require('node:test');
const assert = require('node:assert/strict');
const brazil = require('../dist/modules/brazil-now.js');

const cities = [
  {id:'1302603', name:'Manaus', uf:'AM', lat:-3.119, lon:-60.022, timezone:'America/Manaus'},
  {id:'4314902', name:'Porto Alegre', uf:'RS', lat:-30.035, lon:-51.218, timezone:'America/Sao_Paulo'},
  {id:'1501402', name:'Belém', uf:'PA', lat:-1.456, lon:-48.504, timezone:'America/Belem'}
];

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
