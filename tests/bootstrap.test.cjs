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
    document:{getElementById:element,documentElement:{scrollTop:0},body:{scrollTop:0}},
    window:{scrollTo(){},addEventListener(){},isSecureContext:false},
    navigator:{},setTimeout(){return 1;},clearTimeout(){},
    activeCity:city,cityById:new Map([[city.id,city],['1302603',{id:'1302603',name:'Manaus',uf:'AM'}]]),
    CITIES:[],CAPITALS:[city],favorites:new Set(),cityIndexReady:true,
    updateCityLabels(){},renderCityOptions(){},chooseCity(){},
    searchCities:()=>[city],normalizeName:value=>value.toLowerCase(),escapeHtml:value=>value,
    readPreference:()=>null,prefetchForecast(){},
    PLUVIA:{modules:Object.fromEntries(['weather','alerts','location','air-quality','auth','weather-layers'].map(key=>[key,{}]))},
    loadWeather(){},validForecast(){},loadInmetAlerts(){},selectInmetAlerts(){},requestLocation(){},
    aqiLabel:()=>['Boa','AQI 10'],
  });
  assert.doesNotThrow(() => vm.runInContext(fs.readFileSync('dist/p0.js','utf8'),context));
  assert.doesNotThrow(() => vm.runInContext(fs.readFileSync('dist/modules/adapters.js','utf8'),context));
  vm.runInContext('updateCityLabels()',context);
  assert.equal(nodes.has('defesaActions'),false);
  assert.equal(vm.runInContext('PLUVIA.modules["air-quality"].guidance(10)[0]',context),'Boa');
});
