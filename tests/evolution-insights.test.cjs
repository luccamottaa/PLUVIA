const {test}=require('node:test'),assert=require('node:assert/strict');
const insights=require('../dist/modules/weather-insights.js'),data=require('../dist/modules/weather-data-layer.js');
const {forecast,city}=require('./support/forecast.cjs');
const hourly={time:Array.from({length:48},(_,i)=>new Date(Date.UTC(2026,9,1,i)).toISOString().slice(0,16)),uv_index:Array.from({length:48},(_,i)=>i%24===12 ? 8 : i%24===13 ? 8 : 0)};
test('UV conserva pico do dia depois de passar, sem anunciar pico noturno futuro',()=>{
 const uv=insights.uv(hourly,20);assert.equal(uv.peak,8);assert.equal(uv.time,'12:00');assert.equal(uv.past,true);assert.equal(uv.complete,true);
 assert.match(uv.label,/12:00–13:00.*já passou/);assert.equal(uv.points.length,24);
 const result=insights.build({forecast:{hourly,current:{}},start:20});assert.ok(!result.highlights.some(label=>/^UV/.test(label)));
 const tomorrow=insights.uv(hourly,24);assert.equal(tomorrow.past,false);assert.equal(tomorrow.points[0].index,24);
});
test('UV distingue dados parciais e não converte amostras ausentes em zero',()=>{
 for(const value of [null,undefined,'8',false,-1,NaN]) {
  const input=structuredClone(hourly);input.uv_index[12]=value;
  const uv=insights.uv(input,10);assert.equal(uv.complete,false);assert.equal(uv.points[12].value,null);assert.match(uv.label,/Dados parciais/);
 }
 assert.equal(insights.uv({time:hourly.time,uv_index:Array(48).fill(null)},0),null);
 assert.match(insights.uv({...hourly,uv_index:Array(48).fill(0)},20).label,/UV baixo ao longo do dia/);
});
test('sensação muito menor sem vento conhecido não é descrita como próxima da medida',()=>{
 assert.match(insights.feelsLike({temperature_2m:25,apparent_temperature:20}).label,/Abaixo/);
 assert.match(insights.feelsLike({temperature_2m:25,apparent_temperature:20,wind_speed_10m:20}).label,/vento/);
 assert.match(insights.feelsLike({temperature_2m:25,apparent_temperature:24}).label,/Próxima/);
 assert.match(insights.feelsLike({temperature_2m:0,apparent_temperature:4,relative_humidity_2m:80}).label,/Acima/);
});
test('pressão exige duas amostras numéricas separadas por exatamente três horas reais',()=>{
 const h={time:['2026-10-01T09:00','2026-10-01T10:00','2026-10-01T11:00','2026-10-01T12:00'],pressure_msl:[1010,1010,1011,1012]};
 assert.equal(insights.pressure(h,3,city).trend,'rising');assert.equal(insights.pressure({...h,pressure_msl:[1010,1010,1010,1010.2]},3,city).trend,'stable');
 assert.equal(insights.pressure({...h,time:['2026-10-01T08:00',...h.time.slice(1)]},3,city),null);
 assert.equal(insights.pressure({...h,pressure_msl:[null,1010,1011,1012]},3,city),null);
 assert.equal(insights.pressure(h,2,city),null);
});
test('contrato interno conserva direção horária e marca stale sem renovar timestamps',()=>{
 const input=forecast(),snapshot=data.ingestOpenMeteo(input,null,city,{checkedAt:1000});
 assert.equal(snapshot.hourly[0].windDirection,90);
 const stale=data.markStale(city.id);assert.equal(stale.source.freshness,'stale');assert.equal(stale.source.checkedAt,1000);
 assert.equal(stale.current,snapshot.current);assert.equal(data.get(city.id),stale);assert.equal(data.markStale('missing'),null);
 data.clear(city.id);
});
