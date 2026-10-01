const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('os scripts de inicialização carregam sem a antiga seção da Defesa Civil', () => {
  const city = {id:'5300108',name:'Brasília',uf:'DF',state:'Distrito Federal'};
  const nodes = new Map();
  const element = id => {
    if (!nodes.has(id)) nodes.set(id,{hidden:false,innerHTML:'',textContent:'',value:'',addEventListener(){}});
    return nodes.get(id);
  };
  const context = vm.createContext({
    document:{getElementById:element,addEventListener(){},documentElement:{scrollTop:0},body:{scrollTop:0}},
    window:{scrollTo(){},addEventListener(){},isSecureContext:false},
    navigator:{},setTimeout(){return 1;},clearTimeout(){},
    activeCity:city,cityById:new Map([[city.id,city],['1302603',{id:'1302603',name:'Manaus',uf:'AM'}]]),
    CITIES:[],CAPITALS:[city],favorites:new Set(),cityIndexReady:true,
    updateCityLabels(){},renderCityOptions(){},chooseCity(){},
    searchCities:()=>[city],normalizeName:value=>value.toLowerCase(),escapeHtml:value=>value,
    readPreference:()=>null,prefetchForecast(){},
    PLUVIA:{modules:Object.fromEntries(['weather','alerts','location','air-quality','auth','weather-layers'].map(key=>[key,{}]))},
    loadWeather(){},validForecast(){},loadInmetAlerts(){},selectInmetAlerts(){},favoriteCityAlerts(){},requestLocation(){},
    aqiLabel:()=>['Boa','AQI 10'],
  });
  assert.doesNotThrow(() => vm.runInContext(fs.readFileSync('dist/p0.js','utf8'),context));
  assert.doesNotThrow(() => vm.runInContext(fs.readFileSync('dist/modules/adapters.js','utf8'),context));
  vm.runInContext('updateCityLabels()',context);
  assert.equal(nodes.has('defesaActions'),false);
  assert.equal(vm.runInContext('PLUVIA.modules["air-quality"].guidance(10)[0]',context),'Boa');
});

test('lista inicial mostra as 27 capitais, sem duplicar favoritas, antes de carregar municípios', () => {
  const capitals = vm.runInNewContext(fs.readFileSync('dist/capitals.js','utf8') + '\nCAPITALS', { Intl });
  const manaus = capitals.find(city => city.uf === 'AM');
  const favorite = { id:'2611101', name:'Petrolina', uf:'PE', state:'Pernambuco' };
  const nodes = { citySearch:{value:''}, cityResults:{innerHTML:''}, cityPickerStatus:{textContent:''} };
  let searches = 0;
  const context = {
    document:{getElementById:id => nodes[id]},
    CAPITALS:capitals, activeCity:manaus,
    favorites:new Set([manaus.id, favorite.id]),
    cityById:new Map([...capitals, favorite].map(city => [city.id,city])),
    cityIndexReady:false,
    normalizeName:value => value.toLowerCase(), escapeHtml:value => value,
    searchCities:() => { searches++; return capitals; }
  };
  const p0 = fs.readFileSync('dist/p0.js','utf8');
  vm.runInNewContext(p0.slice(p0.indexOf('let activeResultIndex'),p0.indexOf('function moveCityResult')), context);
  context.renderCityOptions();
  const ids = [...nodes.cityResults.innerHTML.matchAll(/data-id="(\d+)"/g)].map(match => match[1]);
  assert.equal(ids.length,28);
  assert.equal(new Set(ids).size,28);
  assert.deepEqual(ids.slice(0,2),[manaus.id,favorite.id]);
  for (const capital of capitals) assert.ok(ids.includes(capital.id),`capital ausente: ${capital.name}`);
  assert.equal(searches,0,'lista inicial não depende da busca de municípios');
  nodes.citySearch.value = 'cidade';
  context.renderCityOptions();
  assert.equal(searches,1);
  assert.equal((nodes.cityResults.innerHTML.match(/data-id=/g)||[]).length,12,'busca mantém o limite de sugestões');
});
