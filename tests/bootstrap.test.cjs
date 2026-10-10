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
  const app = fs.readFileSync('dist/app.js','utf8');
  vm.runInNewContext(app.slice(app.indexOf('let activeResultIndex'),app.indexOf('function chooseCity(')), context);
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

test('escolha automática da cidade não rouba o foco; fechar o diálogo devolve o foco à busca', () => {
  const app = fs.readFileSync('dist/app.js','utf8');
  const source = app.slice(app.indexOf('function closeCitySearch('),app.indexOf('function requestLocation('));
  let focused = 0, closed = 0, animated = 0;
  const nodes = {cityDialog:{open:false,close(){this.open=false;closed++;}},openCitySearch:{focus(){focused++;}}};
  const context = vm.createContext({$:id => nodes[id], globalThis:{}});
  vm.runInContext(source,context);
  context.closeCitySearch();
  assert.equal(focused,0,'fallback sem localização não move o foco para a busca');
  nodes.cityDialog.open = true;
  context.closeCitySearch();
  assert.deepEqual([closed,focused],[1,1]);
  nodes.cityDialog.open = true;
  context.globalThis.PLUVIA = {dialogs:{close(){animated++;}}};
  vm.runInContext('globalThis.PLUVIA = this.globalThis.PLUVIA', context);
  context.closeCitySearch(true);
  assert.equal(animated,1,'fechamento animado delega ao controlador, que devolve o foco no evento close');
});

test('primeira visita sem sessão salva escolhe Manaus na hora; sessão ou retorno OAuth aguardam a conta', () => {
  const run = ({storage = {}, search = '', hash = ''} = {}) => {
    const nodes = new Map(), chosen = [], timers = [];
    const element = id => {
      if (!nodes.has(id)) nodes.set(id,{hidden:true,innerHTML:'',textContent:'',addEventListener(){}});
      return nodes.get(id);
    };
    const context = vm.createContext({
      document:{getElementById:element,addEventListener(){},querySelectorAll:()=>[],documentElement:{scrollTop:0},body:{scrollTop:0}},
      window:{scrollTo(){},addEventListener(){},isSecureContext:false},
      navigator:{},location:{search,hash},localStorage:storage,
      setTimeout:(fn,ms)=>{timers.push(ms);return timers.length;},clearTimeout(){},
      activeCity:null,cityById:new Map([['1302603',{id:'1302603',name:'Manaus',uf:'AM'}]]),CITIES:[],
      readPreference:()=>null,prefetchForecast(){},locationMessage(){},openCitySearch(){},
      chooseCity:id=>{chosen.push(id);vm.runInContext('activeCity=cityById.get('+JSON.stringify(id)+')',context);},
    });
    vm.runInContext(fs.readFileSync('dist/p0.js','utf8'),context);
    return {chosen,timers,notice:nodes.get('locationNotice')};
  };
  const fresh = run();
  assert.deepEqual(fresh.chosen,['1302603']);
  assert.equal(fresh.timers.includes(1500),false);
  assert.equal(fresh.notice.hidden,false,'o aviso continua visível depois da escolha automática');
  for (const options of [{storage:{'sb-dszyyrcvwrpyiypwyvxe-auth-token':'{}'}},{search:'?auth_return=1'},{hash:'#access_token=x'}]) {
    const waiting = run(options);
    assert.deepEqual(waiting.chosen,[],JSON.stringify(options));
    assert.ok(waiting.timers.includes(1500));
    assert.equal(waiting.notice.hidden,false,'o aviso reserva o espaço desde o primeiro paint');
  }
  const anonStorage = {'sb-dszyyrcvwrpyiypwyvxe-auth-token':JSON.stringify({user:{id:'a',is_anonymous:true}})};
  Object.defineProperty(anonStorage,'getItem',{value:key=>anonStorage[key] ?? null});
  const anonymous = run({storage:anonStorage});
  assert.deepEqual(anonymous.chosen,['1302603'],'sessão anônima dos avisos não tem cidade principal: abre sem esperar');
  assert.equal(anonymous.timers.includes(1500),false);
});
