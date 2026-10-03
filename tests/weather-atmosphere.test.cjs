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

function rainScene() {
 const node=()=>({dataset:{},values:{},style:{setProperty(key,value){this.owner.values[key]=value;}}});
 const root=node(),body=node();root.style.owner=root;body.style.owner=body;
 return {root,body,sky:create({document:{documentElement:root,body}})};
}
test('garoa, chuva leve, moderada e forte usam os códigos WMO em ambas as cenas',()=>{
 const {root,body,sky}=rainScene();
 for(const [kind,codes] of [['drizzle',[51,53,55,56,57]],['light',[61,66,80]],['moderate',[63,81]],['heavy',[65,67,82]]]) {
  for(const code of codes) {
   sky.apply(code,1);
   assert.equal(root.dataset.rain,kind);assert.equal(body.dataset.rain,kind);
   assert.equal(root.dataset.weather,'rain');assert.deepEqual(root.values,body.values);
   assert.ok(+root.values['--rain-opacity']>0 && +root.values['--rain-back-opacity']>0);
  }
 }
});
test('a representação de chuva aumenta gradualmente, com camadas em velocidades diferentes',()=>{
 const {root,sky}=rainScene();let previous={opacity:0,speed:Infinity,width:Infinity};
 for(const code of [51,61,63,65]) {
  sky.apply(code,1);
  const opacity=+root.values['--rain-opacity'],speed=parseFloat(root.values['--rain-speed']),width=parseFloat(root.values['--rain-width']);
  assert.ok(opacity>previous.opacity && opacity<=.8);
  assert.ok(speed<previous.speed && speed>=1);
  assert.ok(width<previous.width && width>=200);
  assert.ok(parseFloat(root.values['--rain-back-speed'])>speed,'camada distante cai mais lentamente');
  previous={opacity,speed,width};
 }
});
test('trovoada não implica automaticamente chuva forte nem representa um raio observado',()=>{
 const {root,sky}=rainScene();sky.apply(63,0);const moderate={...root.values};
 for(const code of [95,96,99]) {
  sky.apply(code,0);
  assert.equal(root.dataset.weather,'storm');assert.equal(root.dataset.rain,'moderate');
  assert.equal(root.values['--rain-opacity'],moderate['--rain-opacity']);
  assert.equal(root.values['--rain-speed'],moderate['--rain-speed']);
 }
});
test('condições secas, neve, neblina e dados inválidos removem a chuva anterior',()=>{
 const {root,body,sky}=rainScene();
 for(const code of [0,2,3,45,48,71,73,75,77,85,86,null,undefined,NaN,Infinity,'65']) {
  sky.apply(65,1);sky.apply(code,0);
  for(const node of [root,body]) {
   assert.equal(node.dataset.rain,'none');
   assert.equal(node.values['--rain-opacity'],'0');assert.equal(node.values['--rain-back-opacity'],'0');
  }
  const before={...root.values};sky.update(Date.now()+30000);
  assert.deepEqual(root.values,before,'o relógio não restaura gotas de outra condição');
 }
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
  assert.ok(state.sunX>=.12 && state.sunX<=.88 && state.sunY>=0 && state.sunY<=1,'sol percorre o arco responsivo');
  assert.ok(state.moonX>=.12 && state.moonX<=.88 && state.moonY>=0 && state.moonY<=1,'lua percorre o arco responsivo');
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
