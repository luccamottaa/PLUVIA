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

test('amanhecer e entardecer usam os horários da cidade, com retorno ao céu normal',()=>{
 context.cityDate = value => new Date(value);
 context.applyWeatherAtmosphere(2,1,{sunrise:['2026-09-28T05:46:00-04:00'],sunset:['2026-09-28T17:54:00-04:00']});
 for (const [time,solar,phase] of [
  ['05:26','sunrise','night'],['06:06','sunrise','day'],
  ['12:00','none','day'],['17:34','sunset','day'],['18:14','sunset','night'],['19:00','none','night']
 ]) {
  context.updateSolarAtmosphere(Date.parse(`2026-09-28T${time}:00-04:00`));
  assert.equal(context.document.body.dataset.solar,solar,time);
  assert.equal(context.document.body.dataset.phase,phase,time);
  assert.equal(context.document.body.dataset.weather,'partly');
 }
 context.applyWeatherAtmosphere(null,null);
 context.updateSolarAtmosphere(Date.parse('2026-09-28T17:54:00-04:00'));
 assert.equal(context.document.body.dataset.solar,'none','trocar cidade elimina horários anteriores');
});
test('sem horários solares válidos preserva o dia/noite do provedor',()=>{
 context.applyWeatherAtmosphere(95,0,{sunrise:['inválido'],sunset:[]});
 assert.equal(context.document.body.dataset.solar,'none');
 assert.equal(context.document.body.dataset.phase,'night');
 assert.equal(context.document.body.dataset.weather,'storm');
});
