const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const time=require('../dist/modules/city-time.js'),{create}=require('../dist/modules/sky-atmosphere.js');
const vendor=vm.createContext({});vm.runInContext(fs.readFileSync('dist/vendor/suncalc.js','utf8'),vendor);
const sun=vendor.PLUVIA.sun;
const manaus={lat:-3.119,lon:-60.022,timezone:'America/Manaus'};
const auckland={lat:-36.85,lon:174.76,timezone:'Pacific/Auckland'};
const stamp=(value,city=manaus)=>time.parse(value,city);
function setup(solar=sun) {
 const node=()=>({dataset:{},style:{values:{},setProperty(key,value){this.values[key]=value;}}});
 const root=node(),body=node();return {root,body,sky:create({document:{documentElement:root,body},sun:solar})};
}
test('estrelas seguem a noite municipal mesmo com is_day antigo do provedor',()=>{
 for(const city of [manaus,auckland]) {
  const {sky}=setup();
  for(const [hour,expected] of [['12:00',0],['22:00',1],['02:00',1]]) {
   const at=stamp('2026-10-03T'+hour,city);
   assert.equal(sky.apply(0,expected ? 1 : 0,null,city,at).starVisibility,expected,city.timezone+' '+hour);
  }
 }
});
test('brilho entra após o pôr do sol e sai gradualmente até o nascer, sem relógio de abertura',()=>{
 const {sky}=setup(),at=stamp('2026-10-03T12:00');sky.apply(0,1,null,manaus,at);
 const events=sun.getTimes(new Date(at),manaus.lat,manaus.lon);
 const set=events.sunset.getTime(),dusk=events.nauticalDusk.getTime(),rise=events.sunrise.getTime(),dawn=events.nauticalDawn.getTime();
 const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
 close(sky.update(set-1).starVisibility,0);close(sky.update(set).starVisibility,0);
 close(sky.update((set+dusk)/2).starVisibility,.5);close(sky.update(dusk).starVisibility,1);
 close(sky.update(dawn).starVisibility,1);close(sky.update((dawn+rise)/2).starVisibility,.5);close(sky.update(rise).starVisibility,0);
 let previous=0;
 for(let t=set;t<dusk;t+=30000) {const v=sky.update(t).starVisibility;assert.ok(v>=previous && v<=1);previous=v;}
 const instant=(set+dusk)/2;
 assert.deepEqual(sky.update(instant),setup().sky.apply(0,1,null,manaus,instant),'abrir no crepúsculo conserva a intensidade calculada');
});
test('céu parcial atenua estrelas; condições fechadas e códigos inválidos limpam o brilho',()=>{
 const {sky,root,body}=setup(),at=stamp('2026-10-03T22:00');
 for(const [code,expected] of [[0,1],[1,.85],[2,.6],[3,0],[45,0],[48,0],[51,0],[61,0],[65,0],[75,0],[95,0],[99,0],[null,0],['0',0],[NaN,0]]) {
  sky.apply(0,0,null,manaus,at);
  const state=sky.apply(code,0,null,manaus,at);
  assert.equal(state.starVisibility,expected,String(code));
  assert.equal(+root.style.values['--stars-visibility'],expected);
  assert.equal(body.style.values['--stars-visibility'],root.style.values['--stars-visibility']);
  assert.equal(sky.update(at+30000).starVisibility,expected,'tick não restaura a condição anterior');
 }
});
test('troca rápida de cidade e passagem da meia-noite não deixam estrelas diurnas',()=>{
 const {sky}=setup(),at=stamp('2026-10-03T22:00');
 assert.equal(sky.apply(0,0,null,manaus,at).starVisibility,1);
 assert.equal(sky.apply(0,0,null,auckland,at).starVisibility,0);
 assert.equal(sky.apply(0,1,null,manaus,at).starVisibility,1);
 for(const local of ['2026-10-03T23:59','2026-10-04T00:00','2026-10-04T00:01']) assert.equal(sky.update(stamp(local)).starVisibility,1);
});
test('fase e estrelas conservam os limites solares da previsão quando diferem da efeméride',()=>{
 const {sky}=setup(),daily={sunrise:['2026-10-03T06:00'],sunset:['2026-10-03T18:00']};
 sky.apply(0,0,daily,manaus,stamp('2026-10-03T12:00'));
 for(const hour of ['06:00','12:00','17:59','18:00']) assert.equal(sky.update(stamp('2026-10-03T'+hour)).starVisibility,0,hour);
 assert.ok(sky.update(stamp('2026-10-03T18:20')).starVisibility>0);
 assert.equal(sky.update(stamp('2026-10-03T20:00')).starVisibility,1);
});
test('fallback sem efeméride usa o ciclo disponível e mantém valores finitos',()=>{
 for(const solar of [null,{getTimes(){throw Error('indisponível');}},{getTimes(){return {nauticalDawn:new Date(NaN),nauticalDusk:new Date(NaN)};}}]) {
  const {sky}=setup(solar),at=stamp('2026-10-03T22:00');
  assert.equal(sky.apply(0,0,null,manaus,at).starVisibility,1);
  assert.equal(sky.apply(0,1,null,manaus,at).starVisibility,0);
  assert.equal(sky.apply(0,null,null,manaus,at).starVisibility,0);
  const daily={sunrise:['2026-10-03T06:00'],sunset:['2026-10-03T18:00']};
  const state=sky.apply(0,0,daily,manaus,stamp('2026-10-03T18:22:30'));
  assert.equal(state.starVisibility,.5,'janela visual de 45 min quando o crepúsculo não está disponível');
  assert.equal(sky.update(NaN).starVisibility,0,'relógio inválido nunca produz opacidade inválida');
 }
});
test('estrelas reutilizam o cache solar; ticks não calculam novas efemérides',()=>{
 let calls=0;const tracked={getTimes(...args){calls++;return sun.getTimes(...args);}};
 const {sky}=setup(tracked),at=stamp('2026-10-03T22:00');sky.apply(0,0,null,manaus,at);
 const initial=calls;
 for(let i=1;i<=20;i++)sky.update(at+i*30000);
 assert.equal(calls,initial);
 sky.apply(0,1,null,auckland,at);assert.ok(calls>initial,'troca de coordenadas invalida o cache');
});
