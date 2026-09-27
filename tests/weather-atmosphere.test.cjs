const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('dist/app.js','utf8');
const context=vm.createContext({document:{body:{dataset:{}}}});
vm.runInContext(app.slice(app.indexOf('function weatherIconType'),app.indexOf('function weatherIconSvg')),context);
test('atmosfera acompanha os códigos meteorológicos e o dia/noite do provedor',()=>{
 for(const [code,type] of [[0,'sun'],[2,'partly'],[3,'cloud'],[45,'fog'],[48,'fog'],[61,'rain'],[82,'rain'],[75,'snow'],[99,'storm']]) {
  for(const [day,phase] of [[0,'night'],[1,'day']]) {
   context.applyWeatherAtmosphere(code,day);
   assert.equal(context.document.body.dataset.weather,type);
   assert.equal(context.document.body.dataset.phase,phase);
  }
 }
});
test('dados ausentes limpam a condição anterior sem inventar céu limpo',()=>{
 context.applyWeatherAtmosphere(95,0);
 context.applyWeatherAtmosphere(null,null);
 assert.equal(context.document.body.dataset.weather,'unknown');
 assert.equal(context.document.body.dataset.phase,'unknown');
});
