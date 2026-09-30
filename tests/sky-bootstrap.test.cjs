const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {create}=require('../dist/modules/sky-atmosphere.js');
const sunContext=vm.createContext({});
vm.runInContext(fs.readFileSync('dist/vendor/suncalc.js','utf8'),sunContext);
const sun=sunContext.PLUVIA.sun;
const manaus={id:'1302603',lat:-3.119,lon:-60.022,timezone:'America/Manaus'};
const curitiba={id:'4106902',lat:-25.429,lon:-49.267,timezone:'America/Sao_Paulo'};
function setup(city=manaus,forecast=null,at=Date.parse('2026-09-30T12:00:00-04:00')) {
  const root={dataset:{},style:{values:{},setProperty(key,value){this.values[key]=value;}}};
  const body={dataset:{},style:{setProperty(){}}};
  const storage={getItem(key){return JSON.stringify({'pluvia-city':city.id,'pluvia-city-record':city,
    [`pluvia-weather-${city.id}`]:{at:at-3600000,data:{forecast}}}[key] ?? null);}};
  const sky=create({document:{documentElement:root,body},sun});
  return {sky,root,body,storage,at};
}
test('primeiro acesso calcula dia e noite sem API nem cache meteorológico',()=>{
  for(const city of [manaus,curitiba]) for(const [hour,phase] of [['12','day'],['23','night'],['03','night']]) {
    const {sky,root,body,storage}=setup(city);
    const state=sky.bootstrap(storage,Date.parse(`2026-09-30T${hour}:00:00-04:00`));
    assert.equal(state.phase,phase,city.timezone+hour);
    assert.equal(root.dataset.phase,body.dataset.phase);
    assert.equal(state.weather,'unknown','sem dados, não inventa chuva ou nuvens');
  }
});
test('intro usa horários solares exatos de cada cidade, inclusive offline',()=>{
  for(const city of [manaus,curitiba]) {
    const {sky,storage,at}=setup(city);
    const times=sun.getTimes(new Date(at),city.lat,city.lon);
    for(const [event,key,phase] of [['sunrise','sunrise','day'],['sunset','sunset','night']]) {
      const state=sky.bootstrap(storage,times[key].getTime());
      assert.equal(state.solar,event);
      assert.equal(state.phase,phase);
      assert.equal(state.strength,1);
      assert.equal(sky.update(times[key].getTime()+31*60000).solar,'none');
    }
  }
});
test('cache diurno não cria sol de dia às 23h e não conserva horário de ontem',()=>{
  const forecast={current:{weather_code:61,is_day:1},daily:{sunrise:['2026-09-29T05:46:00-04:00'],sunset:['2026-09-29T17:54:00-04:00']}};
  const {sky,storage}=setup(manaus,forecast);
  const state=sky.bootstrap(storage,Date.parse('2026-09-30T23:06:00-04:00'));
  assert.equal(state.phase,'night'); assert.equal(state.solar,'none'); assert.equal(state.weather,'rain');
});
test('troca de cidade recalcula o ciclo e remove tempestade anterior',()=>{
  const {sky,at}=setup();
  sky.apply(99,1,null,manaus,at);
  const times=sun.getTimes(new Date(at),curitiba.lat,curitiba.lon);
  const state=sky.apply(null,null,null,curitiba,times.sunset.getTime());
  assert.equal(state.solar,'sunset'); assert.equal(state.weather,'unknown');
  assert.equal(sky.update(Date.parse('2026-10-01T23:00:00-03:00')).phase,'night');
});
test('armazenamento bloqueado ou inválido preserva abertura e relógio solar',()=>{
  const {sky,at}=setup();
  assert.equal(sky.bootstrap({getItem(){throw Error('blocked');}},at).phase,'day');
  assert.equal(sky.bootstrap({getItem(){return '{bad';}},at).phase,'day');
  const doc={documentElement:{dataset:{},style:{setProperty(){}}}};
  const context={document:doc,PLUVIA:{sun}};
  Object.defineProperty(context,'localStorage',{get(){throw Error('blocked');}});
  assert.doesNotThrow(()=>vm.runInNewContext(fs.readFileSync('dist/modules/sky-atmosphere.js','utf8'),context));
});
test('animações da atmosfera não colidem com animações dos ícones',()=>{
  const sky=fs.readFileSync('dist/sky.css','utf8');
  const base=fs.readFileSync('dist/styles.css','utf8')+fs.readFileSync('dist/redesign.css','utf8');
  for(const [,name] of sky.matchAll(/@keyframes\s+([\w-]+)/g)) assert.ok(!base.includes('@keyframes '+name),name);
});
test('retomar à noite atualiza o ícone diurno de uma previsão salva',()=>{
  const {sky,body,storage}=setup(manaus,{current:{weather_code:0,is_day:1}});
  sky.bootstrap(storage,Date.parse('2026-09-30T12:00:00-04:00'));
  const at=Date.parse('2026-09-30T23:00:00-04:00');
  const fields=new Map();const el=id=>{if(!fields.has(id))fields.set(id,{});return fields.get(id);};
  const context={activeCity:manaus,displayedWeather:{forecast:{current:{weather_code:0,is_day:1}}},
    document:{body},$:el,renderMoon(){},updateSolarAtmosphere:sky.update,weatherIconSvg:(code,day)=>day?'sun':'moon',
    Date:class extends Date{constructor(value){super(value ?? at);}}};
  const app=fs.readFileSync('dist/app.js','utf8');
  vm.runInNewContext(app.slice(app.indexOf('function updateClock()'),app.indexOf('const dateOffsets')),context);
  context.updateClock();
  assert.equal(el('weatherGlyph').innerHTML,'moon');
});
