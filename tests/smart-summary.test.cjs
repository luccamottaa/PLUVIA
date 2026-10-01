const test = require('node:test');
const assert = require('node:assert/strict');
const summary = require('../dist/modules/smart-summary.js');

function fixture(overrides = {}) {
  const base = {
    current:{time:'2026-09-13T14:00',weather_code:2,temperature_2m:32,apparent_temperature:36,relative_humidity_2m:72,precipitation:0,wind_gusts_10m:18},
    hourly:{
      time:Array.from({length:7},(_,i)=>new Date(Date.UTC(2026,8,13,14+i)).toISOString().slice(0,16)),
      precipitation_probability:[10,15,20,20,20,20,20], precipitation:[0,0,0,0,0,0,0],
      wind_gusts_10m:[18,20,20,20,20,20,20], weather_code:[2,2,2,3,3,3,3], uv_index:[6,5,4,2,1,0,0]
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
  const data = fixture({hourly:{precipitation_probability:[0,75,80,70,0,0,0],precipitation:[0,2,3,2,0,0,0],wind_gusts_10m:[35,40,42,35,30,30,30],weather_code:[95,95,81,81,3,3,3],uv_index:[0,0,0,0,0,0,0]}});
  const context = summary.buildContext(data, null, 0, city);
  const result = summary.deterministic(context);
  assert.equal(result.status, 'danger');
  assert.match(result.title, /Trovoada/);
  assert.equal(summary.validate(result, context), true);
});

test('prioriza rajadas sem inventar alerta oficial', () => {
  const data = fixture({hourly:{precipitation_probability:[10,10,10,10,10,10,10],precipitation:[0,0,0,0,0,0,0],wind_gusts_10m:[58,61,57,57,57,57,57],weather_code:[2,2,2,2,2,2,2],uv_index:[3,2,1,0,0,0,0]}});
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

test('chuva usa o intervalo seguinte e não o acumulado que já terminou',()=>{
  const data=fixture();data.hourly.precipitation[0]=100;data.hourly.precipitation_probability[0]=100;
  const context=summary.buildContext(data,null,0,city);
  assert.equal(context.next3h.precipitation,0);assert.equal(context.next3h.probability,20);
  assert.equal(summary.deterministic(context).status,'calm');
});

test('dados ausentes, nulos e horários com lacunas nunca afirmam condições estáveis',()=>{
  for(const change of [data=>data.hourly.precipitation[2]=null,data=>data.hourly.precipitation_probability[2]='0',data=>data.hourly.time.splice(2,1),data=>data.hourly={time:[]}]) {
    const data=fixture();change(data);const context=summary.buildContext(data,null,0,city);
    assert.equal(context.complete,false);assert.equal(summary.deterministic(context).status,'info');
  }
});

test('hash distingue códigos e probabilidade de seis horas, mesmo com agregados iguais',()=>{
  const context=summary.buildContext(fixture(),null,0,city),other=structuredClone(context);
  other.next3h.codes[0]=95;assert.notEqual(summary.contextHash(context),summary.contextHash(other));
  other.next3h.codes=context.next3h.codes;other.next6h.probability=90;
  assert.notEqual(summary.contextHash(context),summary.contextHash(other));
  const result=summary.deterministic(context);
  assert.equal(summary.validate({...result,highlights:[null]},context),false);
  assert.equal(summary.validate({...result,highlights:[{label:'x',tone:'danger onclick=',evidence:'uv'}]},context),false);
});
