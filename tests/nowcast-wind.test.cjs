const {test}=require('node:test'),assert=require('node:assert/strict');
const {stationWind}=require('../dist/modules/nowcast.js');
test('vento METAR é mostrado em km/h com direção de origem meteorológica',()=>{
 assert.match(stationWind({windKmh:18.52,gustKmh:37.04,windFromDegrees:90}),/Vento 19 km\/h, vindo de L · rajadas 37 km\/h/);
 assert.match(stationWind({windKmh:18.52,gustKmh:null,windFromDegrees:360}),/vindo de N.*rajadas não informadas/);
 assert.match(stationWind({windKmh:10,gustKmh:20,windFromDegrees:null}),/direção variável ou indisponível/);
});
test('ausência de rajada ou direção não vira zero e vento calmo não recebe direção',()=>{
 for(const value of [null,'5',NaN,-1,501]) assert.equal(stationWind({windKmh:value}),'Vento observado indisponível.');
 assert.match(stationWind({windKmh:0,windFromDegrees:90}),/^Vento calmo/);assert.doesNotMatch(stationWind({windKmh:0,windFromDegrees:90}),/vindo de/);
 assert.match(stationWind({windKmh:30,gustKmh:10,windFromDegrees:'90'}),/direção variável.*rajadas não informadas/);
});
