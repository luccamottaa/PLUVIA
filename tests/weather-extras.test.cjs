const test = require('node:test');
const assert = require('node:assert/strict');
const {bestWindow, ensembleAgreement} = require('../dist/modules/weather-extras.js');

test('escolhe duas horas consecutivas com menor exposição sem prometer ausência de chuva', () => {
  const hourly = {
    time:['10:00','11:00','12:00','13:00','14:00'],
    precipitation_probability:[5,90,90,20,20],
    precipitation:[0,2,2,0,0],
    apparent_temperature:[30,30,30,34,34],
    uv_index:[2,2,2,6,6],
    wind_gusts_10m:[5,5,5,10,10]
  };
  assert.equal(bestWindow(hourly,0).start,'12:00');
  assert.equal(bestWindow(hourly,0).end,'14:00');
  hourly.uv_index[3] = null;
  assert.notEqual(bestWindow(hourly,0)?.start,'12:00');
  assert.equal(bestWindow(hourly,4),null);
});

test('concordância exige pelo menos cinco membros e três horários alinhados', () => {
  const hourly = {time:['a','b','c']};
  for(let i=1;i<=6;i++) hourly[`precipitation_member${String(i).padStart(2,'0')}`] = i<=3 ? [0,0,0] : [1,1,1];
  assert.equal(ensembleAgreement(hourly,['a','b','c']).level,'baixa');
  for(let i=4;i<=6;i++) hourly[`precipitation_member${String(i).padStart(2,'0')}`] = [0,0,0];
  assert.equal(ensembleAgreement(hourly,['a','b','c']).level,'alta');
  assert.equal(ensembleAgreement(hourly,['a','b']),null);
});
