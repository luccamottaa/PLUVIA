const {test}=require('node:test'),assert=require('node:assert/strict');
const {snapshot,valid,MAX_AGE_MS}=require('../dist/favorite-cities.js');
test('favoritos mostram valores reais e chance máxima nas próximas horas',()=>{
 const value=snapshot({current:{temperature_2m:29,weather_code:2,time:'2026-09-30T20:00',is_day:0},hourly:{time:['2026-09-30T19:00','2026-09-30T20:00','2026-09-30T21:00','2026-09-30T22:00'],precipitation_probability:[100,0,40,20]}},1000);
 assert.equal(value.temperature,29);assert.equal(value.rain,40);assert.equal(value.isDay,false);
 assert.equal(valid(value,2000),true);assert.equal(valid(value,1000+MAX_AGE_MS+1),false);assert.equal(valid(value,999),false);
});
test('favoritos não inventam chuva nem temperatura quando o serviço omite dados',()=>{
 assert.equal(snapshot({current:{temperature_2m:null,weather_code:0}}),null);
 const value=snapshot({current:{temperature_2m:0,weather_code:0}});
 assert.equal(value.temperature,0);assert.equal(value.rain,null);
});
