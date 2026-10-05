const {test}=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../dist/modules/sky-atmosphere.js');
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
