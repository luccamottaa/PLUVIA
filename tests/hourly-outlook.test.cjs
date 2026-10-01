const {test}=require('node:test'),assert=require('node:assert/strict');
const {build}=require('../dist/modules/hourly-outlook.js');
const times=['2026-09-30T21:00','2026-09-30T22:00','2026-09-30T23:00','2026-10-01T00:00','2026-10-01T01:00'];
test('janela de maior chance agrupa horários próximos do pico e soma volume conhecido',()=>{
 const result=build({time:times,precipitation_probability:[20,70,80,75,10],precipitation:[0,1,2,1,0]},0,times.length);
 assert.equal(result.kind,'peak');assert.equal(result.start,times[1]);assert.equal(result.end,times[4]);assert.equal(result.probability,80);assert.equal(result.volume,4);
});
test('dados ausentes não viram zero nem promessa de tempo seco',()=>{
 const result=build({time:times,precipitation_probability:[null,null,null],precipitation:[null]});
 assert.equal(result.kind,'unavailable');assert.equal(result.probability,null);assert.equal(result.volume,null);
 const partial=build({time:times,precipitation_probability:[10,null,20,5,0],precipitation:[0,0,0,0,0]});
 assert.equal(partial.kind,'low');assert.equal(partial.complete,false);
});
test('resumo respeita a hora selecionada e dados de chuva zerados válidos',()=>{
 const result=build({time:times,precipitation_probability:[99,20,0,0,0],precipitation:[9,0,0,0,0]},1,times.length-1);
 assert.equal(result.kind,'low');assert.equal(result.probability,20);assert.equal(result.volume,0);
});
test('previsão truncada não apresenta duas horas como volume completo de 12h',()=>{
 const result=build({time:times.slice(0,2),precipitation_probability:[70,80],precipitation:[1,2]});
 assert.equal(result.kind,'peak');assert.equal(result.complete,false);assert.equal(result.volume,null);
});
