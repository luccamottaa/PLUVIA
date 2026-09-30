const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {create}=require('../dist/modules/sky-atmosphere.js');
const context={document:{documentElement:{dataset:{},style:{setProperty(){}}},body:{dataset:{}}},activeCity:null};
const sky=create({document:context.document});
context.applyWeatherAtmosphere=(code,day,daily)=>sky.apply(code,day,daily,context.activeCity);
context.updateSolarAtmosphere=sky.update;
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
 context.activeCity = null;
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

test('abrir às 23h e antes do amanhecer ignora o is_day antigo do cache',()=>{
 context.activeCity = null;
 const daily={sunrise:['2026-09-29T05:46:00-04:00'],sunset:['2026-09-29T17:54:00-04:00']};
 for(const time of ['00:05','03:00','23:06']) {
  context.applyWeatherAtmosphere(0,1,daily);
  context.updateSolarAtmosphere(Date.parse(`2026-09-29T${time}:00-04:00`));
  assert.equal(context.document.body.dataset.solar,'none');
  assert.equal(context.document.body.dataset.phase,'night');
 }
});
test('efeito limitado a trinta minutos e encerrado imediatamente ao sair da janela',()=>{
 const values={};context.document.body.style={setProperty:(key,value)=>values[key]=value};
 context.activeCity = null;
 context.applyWeatherAtmosphere(0,1,{sunrise:['2026-09-29T05:46:00-04:00'],sunset:['2026-09-29T17:54:00-04:00']});
 for(const time of ['05:46','17:54']) {
  context.updateSolarAtmosphere(Date.parse(`2026-09-29T${time}:00-04:00`));
  assert.equal(values['--twilight-opacity'],'1.000');
 }
 for(const time of ['05:15','06:17','17:23','18:25','23:00']) {
  context.updateSolarAtmosphere(Date.parse(`2026-09-29T${time}:00-04:00`));
  assert.equal(context.document.body.dataset.solar,'none');
  assert.equal(values['--twilight-opacity'],'0.000');
 }
 context.applyWeatherAtmosphere(null,null);
 assert.equal(values['--twilight-opacity'],'0.000');
});
test('horários sem offset usam o fuso da cidade e a troca limpa os horários anteriores',()=>{
 for(const [zone,offset,rise,set] of [['Manaus','-04:00','05:46','17:54'],['Curitiba','-03:00','05:59','18:18']]) {
  context.activeCity={timezone:zone === 'Manaus' ? 'America/Manaus' : 'America/Sao_Paulo'};
  context.applyWeatherAtmosphere(2,1,{sunrise:[`2026-09-29T${rise}:00`],sunset:[`2026-09-29T${set}:00`]});
  context.updateSolarAtmosphere(Date.parse(`2026-09-29T${set}:00${offset}`));
  assert.equal(context.document.body.dataset.solar,'sunset',zone);
  context.updateSolarAtmosphere(Date.parse(`2026-09-29T23:06:00${offset}`));
  assert.equal(context.document.body.dataset.phase,'night',zone);
  assert.equal(context.document.body.dataset.solar,'none',zone);
 }
 context.applyWeatherAtmosphere(2,0,{sunrise:[],sunset:[]});
 assert.equal(context.document.body.dataset.solar,'none');
});
test('sol e lua desaparecem nos horários solares sem um segundo sol após o entardecer',()=>{
 const sky=create();
 const daily={sunrise:['2026-09-30T05:46:00-04:00'],sunset:['2026-09-30T17:54:00-04:00']};
 const at=time=>Date.parse(`2026-09-30T${time}:00-04:00`);
 sky.apply(0,1,daily,null,at('12:00'));
 for(const [time,sun,moon] of [
  ['05:30',0,1],['05:38',0,8/15],['05:46',0,0],['05:53',7/15,0],['06:01',1,0],
  ['12:00',1,0],['17:39',1,0],['17:47',7/15,0],['17:54',0,0],['18:01',0,7/15],['18:09',0,1],['23:00',0,1]
 ]) {
  const state=sky.update(at(time));
  assert.ok(Math.abs(state.sunVisibility-sun)<1e-9,time+' sol');
  assert.ok(Math.abs(state.moonVisibility-moon)<1e-9,time+' lua');
  assert.ok(state.sunVisibility*state.moonVisibility===0,time+' não sobrepõe os astros');
  assert.ok(Math.abs(state.sunX)<=14 && state.sunY>=0 && state.sunY<=14,'sol fica no pequeno arco superior');
  assert.ok(Math.abs(state.moonX)<=12 && state.moonY>=0 && state.moonY<=12,'lua fica no pequeno arco superior');
 }
});
test('reabrir conserva a posição do relógio; trocar cidade usa outro nascer e pôr do sol',()=>{
 const daily={sunrise:['2026-09-30T05:46:00-04:00'],sunset:['2026-09-30T17:54:00-04:00']};
 const at=Date.parse('2026-09-30T17:47:00-04:00');
 const opened=create().apply(0,1,daily,null,at);
 const running=create();running.apply(0,1,daily,null,at-3600000);
 assert.deepEqual(opened,running.update(at),'não recomeça o ciclo ao abrir');
 const other={sunrise:['2026-09-30T05:59:00-03:00'],sunset:['2026-09-30T18:18:00-03:00']};
 const changed=running.apply(0,1,other,{timezone:'America/Sao_Paulo'},at);
 assert.equal(changed.sunVisibility,0);assert.equal(changed.moonVisibility,1);
});
test('horários inválidos mantêm o ciclo disponível do provedor sem posições inválidas',()=>{
 const sky=create();
 for(const [day,sun,moon] of [[1,1,0],[0,0,1],[null,0,0]]) {
  const state=sky.apply(0,day,{sunrise:['inválido'],sunset:[]});
  assert.equal(state.sunVisibility,sun);assert.equal(state.moonVisibility,moon);
  for(const key of ['sunX','sunY','moonX','moonY'])assert.ok(Number.isFinite(state[key]),key);
 }
});
