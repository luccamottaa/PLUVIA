const test = require('node:test');
const assert = require('node:assert/strict');
const summary = require('../dist/modules/smart-summary.js');

function fixture(overrides = {}) {
  const base = {
    current:{time:'2026-09-13T14:00',weather_code:2,temperature_2m:32,apparent_temperature:36,relative_humidity_2m:72,precipitation:0,wind_gusts_10m:18},
    hourly:{
      precipitation_probability:[10,15,20,20,20,20], precipitation:[0,0,0,0,0,0],
      wind_gusts_10m:[18,20,20,20,20,20], weather_code:[2,2,2,3,3,3], uv_index:[6,5,4,2,1,0]
    }
  };
  return {current:{...base.current,...overrides.current},hourly:{...base.hourly,...overrides.hourly}};
}

const city = {id:'1302603',name:'Manaus',timezone:'America/Manaus'};

test('gera resumo calmo verificável e com hash estável', () => {
  const context = summary.buildContext(fixture(), null, 0, city);
  const result = summary.deterministic(context);
  assert.equal(result.status, 'calm');
  assert.equal(summary.validate(result, context), true);
  assert.equal(result.contextHash, summary.contextHash(context));
});

test('prioriza trovoada sustentada pelos dados', () => {
  const data = fixture({hourly:{precipitation_probability:[75,80,70],precipitation:[2,3,2],wind_gusts_10m:[35,40,42],weather_code:[95,95,81],uv_index:[0,0,0]}});
  const context = summary.buildContext(data, null, 0, city);
  const result = summary.deterministic(context);
  assert.equal(result.status, 'danger');
  assert.match(result.title, /Trovoada/);
  assert.equal(summary.validate(result, context), true);
});

test('prioriza rajadas sem inventar alerta oficial', () => {
  const data = fixture({hourly:{precipitation_probability:[10,10,10],precipitation:[0,0,0],wind_gusts_10m:[58,61,57],weather_code:[2,2,2],uv_index:[3,2,1]}});
  const result = summary.deterministic(summary.buildContext(data, null, 0, city));
  assert.equal(result.status, 'warning');
  assert.match(result.summary, /vento/i);
  assert.doesNotMatch(result.summary, /alerta oficial/i);
});

test('rejeita resposta sem evidência ou com hash de outro contexto', () => {
  const context = summary.buildContext(fixture(), null, 0, city);
  const result = summary.deterministic(context);
  assert.equal(summary.validate({...result, contextHash:'adulterado'}, context), false);
  assert.equal(summary.validate({...result, evidence:['valor.inventado']}, context), false);
});
