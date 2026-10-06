const {test}=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../dist/modules/sky-atmosphere.js');
const fs=require('node:fs'),vm=require('node:vm');
const city={id:'1302603',lat:-3.119,lon:-60.022,timezone:'America/Manaus'};
const at=Date.parse('2026-10-01T22:00:00-04:00');
function setup() {
  const node=()=>({dataset:{},style:{setProperty(){}}});
  const root=node(),body=node();
  return {root,body,sky:create({document:{documentElement:root,body}})};
}
test('céu quase limpo tem cobertura esparsa, distinta de parcialmente nublado, de dia e de noite',()=>{
  const {sky,root,body}=setup();
  for(const isDay of [0,1]) for(const [code,profile,weather] of [[1,'few','partly'],[2,'standard','partly'],[3,'standard','cloud']]) {
    const state=sky.apply(code,isDay,null,city,at);
    assert.equal(state.clouds,profile);
    assert.equal(state.weather,weather,'mantém a paleta e os consumidores existentes');
    assert.equal(root.dataset.clouds,profile);
    assert.equal(body.dataset.clouds,profile,'intro e Home compartilham a mesma cobertura');
    assert.equal(sky.update(at+30000).clouds,profile,'o relógio conserva o perfil da condição');
  }
});
test('trocar condição ou cidade limpa o perfil esparso sem conservar o céu anterior',()=>{
  const {sky,root,body}=setup();
  for(const code of [0,2,3,45,61,65,71,95,null,undefined,NaN,'1']) {
    sky.apply(1,0,null,city,at);
    const state=sky.apply(code,0,null,{...city,id:'4106902',timezone:'America/Sao_Paulo'},at);
    assert.equal(state.clouds,'standard',String(code));
    assert.equal(root.dataset.clouds,body.dataset.clouds);
  }
});
test('abertura com previsão salva reutiliza a mesma cobertura de céu quase limpo',()=>{
  const {sky,root}=setup();
  const storage={getItem(key){return JSON.stringify({
    'pluvia-city':city.id,'pluvia-city-record':city,
    [`pluvia-weather-${city.id}`]:{at:at-60000,data:{forecast:{current:{weather_code:1,is_day:0}}}}
  }[key] ?? null);}};
  assert.equal(sky.bootstrap(storage,at).clouds,'few');
  assert.equal(root.dataset.weather,'partly');
  assert.equal(sky.bootstrap({getItem(){return null;}},at).clouds,'standard','sem cache não inventa poucas nuvens');
});
test('chuva moderada/forte e trovoada escurecem o céu diurno e trocam a tinta do texto; crepúsculo e noite preservam a regra',()=>{
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync('dist/vendor/suncalc.js','utf8'),context);
  const root={dataset:{},style:{setProperty(){}}},body={dataset:{},style:{setProperty(){}}};
  const sky=create({document:{documentElement:root,body},sun:context.PLUVIA.sun});
  const noon=Date.parse('2026-10-01T12:00:00-04:00');
  for(const [code,rain,ink] of [[0,'none','dark'],[3,'none','dark'],[51,'drizzle','dark'],[61,'light','dark'],[63,'moderate','light'],[65,'heavy','light'],[95,'moderate','light']]) {
    sky.apply(code,1,null,city,noon);
    assert.equal(root.dataset.rain,rain,String(code));
    assert.equal(root.dataset.ink,ink,String(code));
    assert.equal(body.dataset.ink,ink,'intro e Home usam a mesma tinta');
    assert.equal(sky.update(noon+30000).phase,'day');
    assert.equal(body.dataset.ink,ink,'o relógio conserva a tinta da condição');
  }
  for(const code of [0,3,65,95]) { sky.apply(code,0,null,city,at); assert.equal(root.dataset.ink,'light',String(code)); }
  const sunset=sky.dayAt(noon).set;
  sky.apply(65,1,null,city,sunset-60000);
  assert.equal(root.dataset.solar,'sunset');
  assert.equal(root.dataset.ink,'dark','a luz do crepúsculo mantém a tinta escura');
});
test('vento atual controla a velocidade das nuvens sem salto; leitura ausente não vira calmaria',()=>{
  const {cloudRate}=require('../dist/modules/sky-atmosphere.js');
  assert.equal(cloudRate(10),1,'10 km/h mantém a duração de referência do CSS');
  assert.equal(cloudRate(0),.4);
  assert.equal(cloudRate(5),.7);
  assert.equal(cloudRate(20),1.6);
  assert.equal(cloudRate(80),2.4,'vendaval tem teto');
  for(const missing of [null,undefined,NaN,'12',-3,Infinity]) assert.equal(cloudRate(missing),1,String(missing));
  const animations=[{animationName:'clouds-back',playbackRate:1},{animationName:'clouds-front',playbackRate:1},{animationName:'sky-rain-fall',playbackRate:1}];
  const values={},root={dataset:{},style:{setProperty(key,value){values[key]=value;}}},body={dataset:{},style:{setProperty(){}}};
  const layers=[{getAnimations:()=>animations.slice(0,2)},{getAnimations:()=>[animations[2]]}];
  const sky=create({document:{documentElement:root,body,querySelectorAll:selector=>selector==='.sky-clouds'?layers:[]}});
  sky.apply(3,1,null,city,at,20);
  assert.deepEqual(animations.map(a=>a.playbackRate),[1.6,1.6,1],'só as nuvens mudam; chuva conserva o próprio ritmo');
  assert.equal(values['--cloud-rate'],'1.6');
  sky.update(at+30000);
  assert.equal(animations[0].playbackRate,1.6,'o relógio conserva o vento da última previsão');
  sky.apply(3,1,null,city,at);
  assert.equal(animations[0].playbackRate,1,'troca de cidade/condição sem vento volta ao ritmo neutro');
});
