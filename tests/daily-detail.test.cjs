const {test}=require('node:test'),assert=require('node:assert/strict');
const daily=require('../dist/modules/daily-detail.js');
const {forecast,city}=require('./support/forecast.cjs');
test('detalhe diário preserva totais, sensação e intervalos horários sem novas consultas',()=>{
 const f=forecast('2026-10-04',0);
 f.hourly.precipitation[2]=2;f.hourly.precipitation_probability[2]=70;
 f.daily.precipitation_sum[0]=12;f.daily.precipitation_probability_max[0]=80;
 const reading=daily.detail(f.daily,f.hourly,0,city);
 assert.equal(reading.mm,12);assert.equal(reading.probability,80);assert.equal(reading.feelsMax,38);
 assert.equal(reading.hours[0].mm,2);assert.equal(reading.hours[0].probability,70);
 assert.equal(reading.hours.length,24);assert.equal(reading.complete,true);assert.equal(reading.wind,12);
});
test('horários ausentes e valores inválidos não viram zero ou totais completos',()=>{
 const f=forecast('2026-10-04',12);f.daily.precipitation_sum[0]=null;f.daily.apparent_temperature_max[0]=undefined;
 f.hourly.wind_speed_10m.fill(null);f.hourly.wind_gusts_10m.fill(-1);
 const reading=daily.detail(f.daily,f.hourly,0,city);
 assert.equal(reading.mm,null);assert.equal(reading.feelsMax,null);assert.equal(reading.wind,null);assert.equal(reading.gust,null);
 assert.equal(reading.complete,false);assert.equal(reading.hours.length,13);
 assert.equal(daily.detail(f.daily,f.hourly,7,city).hours.length,0);
 f.daily.time[0]='2026-02-30';assert.equal(daily.detail(f.daily,f.hourly,0,city),null);
 assert.equal(daily.detail(f.daily,f.hourly,-1,city),null);
});
test('o dia municipal funciona em outro fuso, sem duplicar amostras',()=>{
 const f=forecast('2026-10-04',0),before=process.env.TZ;
 try {
  process.env.TZ='Asia/Tokyo';const one=daily.detail(f.daily,f.hourly,0,city);
  process.env.TZ='UTC';assert.deepEqual(daily.detail(f.daily,f.hourly,0,city),one);
  f.hourly.time[2]=f.hourly.time[1];assert.equal(daily.detail(f.daily,f.hourly,0,city).hours.length,23);
 } finally {if(before===undefined)delete process.env.TZ;else process.env.TZ=before;}
});
test('cobertura horária usa a duração real de um dia com DST',()=>{
 const hourly={time:Array.from({length:23},(_,i)=>new Date(Date.parse('2026-03-08T05:00Z')+i*3600000).toISOString())};
 const reading=daily.detail({time:['2026-03-08']},hourly,0,{timezone:'America/New_York'});
 assert.equal(reading.expectedHours,23);assert.equal(reading.hours.length,23);assert.equal(reading.complete,true);
 const fall={time:Array.from({length:25},(_,i)=>new Date(Date.parse('2026-11-01T04:00Z')+i*3600000).toISOString())};
 const repeated=daily.detail({time:['2026-11-01']},fall,0,{timezone:'America/New_York'});
 assert.equal(repeated.expectedHours,25);assert.equal(repeated.hours.length,25);assert.equal(repeated.complete,true);
});
