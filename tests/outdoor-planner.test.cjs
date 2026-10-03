const {test}=require('node:test'),assert=require('node:assert/strict');
const planner=require('../dist/modules/outdoor-planner.js'),time=require('../dist/modules/city-time.js');
const {forecast,city}=require('./support/forecast.cjs');
function input() {
 const hourly=forecast('2026-10-03',10).hourly;
 hourly.apparent_temperature.fill(26);hourly.uv_index.fill(2);
 const now=time.parse('2026-10-03T10:15',city);
 return {hourly,city,now,weatherAt:now,dayAt:at=>{const date=time.dayKey(at,city);return {rise:time.parse(date+'T06:00',city),set:time.parse(date+'T18:00',city)};}};
}
test('compara faixas futuras de duas horas, preservando o alinhamento da chuva',()=>{
 const data=input(),h=data.hourly;
 h.precipitation_probability[2]=100;h.precipitation[2]=10; // Ends at 11h: does not describe 11–12h.
 const result=planner.build(data);
 assert.equal(result.kind,'window');assert.equal(time.localParts(result.start,city.timezone).hour,11);assert.equal(result.index,2);
 assert.equal(result.probability,10);assert.equal(result.mm,0);assert.equal(result.end-result.start,7200000);
 h.precipitation_probability[3]=100;h.precipitation[3]=10;
 const next=planner.build(data);assert.ok(next.start>result.start);
});
test('ordena calor, chuva, vento e UV de forma determinística e escolhe o melhor horário',()=>{
 const data=input(),h=data.hourly;h.apparent_temperature.fill(33);h.apparent_temperature.fill(23,5,8);
 const first=planner.build(data);assert.equal(first.index,5);assert.deepEqual(planner.build(data),first);
 h.wind_gusts_10m[6]=60;assert.notEqual(planner.build(data).index,5);
 h.wind_gusts_10m[6]=20;h.uv_index[6]=9;assert.notEqual(planner.build(data).index,5);
});
test('não recomenda durante aviso, cache salvo ou dados antigos; limite de idade não se renova',()=>{
 const data=input();
 for(const extra of [{officialWarning:true},{fromCache:true},{weatherAt:data.now-91*60000},{weatherAt:data.now+1},{weatherAt:undefined}]) assert.equal(planner.build({...data,...extra}).kind,'unavailable');
 assert.equal(planner.build({...data,weatherAt:data.now-90*60000}).kind,'window');
});
test('dados ausentes, strings e lacunas não viram tempo tranquilo',()=>{
 for(const field of ['apparent_temperature','precipitation','precipitation_probability','wind_speed_10m','weather_code']) {
  const data=input();data.hourly[field].fill(null);assert.equal(planner.build(data).kind,'unavailable',field);
  data.hourly[field].fill('0');assert.equal(planner.build(data).kind,'unavailable',field);
 }
 const data=input();data.hourly.time=data.hourly.time.map((stamp,i)=>i%2 ? stamp.replace('T','BAD') : stamp);
 assert.equal(planner.build(data).kind,'unavailable');
});
test('não fabrica rajadas/UV; dados parciais continuam vetando extremos conhecidos',()=>{
 const data=input();data.hourly.uv_index.fill(null);data.hourly.wind_gusts_10m.fill(null);
 const result=planner.build(data);assert.equal(result.uv,null);assert.equal(result.gust,null);assert.match(planner.copy(result,city,data.now).note,/UV incompleto.*rajadas incompletas/);
 data.hourly.wind_gusts_10m.fill(100);assert.equal(planner.build(data).kind,'unavailable');
});
test('não recomenda chuva, tempestade, neblina, calor excessivo ou vento forte',()=>{
 for(const [field,value] of [['weather_code',95],['weather_code',45],['apparent_temperature',38],['wind_speed_10m',35],['precipitation',1],['precipitation_probability',65],['uv_index',8]]) {
  const data=input();data.hourly[field].fill(value);assert.equal(planner.build(data).reason,'conditions',field);
 }
});
test('atravessa meia-noite pelo fuso municipal e exclui faixas sem luz do dia',()=>{
 const data=input();data.now=time.parse('2026-10-03T23:59',city);data.weatherAt=data.now;
 const result=planner.build(data);assert.equal(time.dayKey(result.start,city),'2026-10-04');assert.equal(time.localParts(result.start,city.timezone).hour,6);
 assert.match(planner.copy(result,city,data.now).title,/Amanhã, 06:00–08:00/);
 data.now+=60000;data.weatherAt=data.now;assert.match(planner.copy(planner.build(data),city,data.now).title,/Hoje/);
});
test('intervalos com offset incompatível e falta de nascer/pôr do sol são recusados',()=>{
 const data=input();data.dayAt=()=>null;assert.equal(planner.build(data).reason,'missing');
 const next=input();next.hourly.time=next.hourly.time.map((stamp,i)=>stamp+(i%2 ? '-03:00' : '-04:00'));
 assert.equal(planner.build(next).kind,'unavailable');
});
