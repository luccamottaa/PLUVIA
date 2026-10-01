const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const share = require('../dist/modules/weather-share.js');
const icons = require('../dist/modules/weather-icon-system.js');
const now = Date.parse('2026-09-30T14:00:00Z');
function snapshot(id = '1302603', name = 'Manaus', region = 'AM', timezone = 'America/Manaus') {
  return {
    location:{id,name,region,timezone,latitude:-3.119,longitude:-60.022},
    current:{time:'2026-09-30T10:00',temperature:31,apparentTemperature:36,weatherCode:2,isDay:true},
    daily:[{time:'2026-09-30',temperatureMax:34,temperatureMin:25,precipitationProbabilityMax:70}],
    source:{weather:'met-norway+open-meteo',kind:'model',freshness:'current',checkedAt:now}
  };
}
const model = (value = snapshot(), options = {}) => share.createModel(value,{now,icons,...options});

test('compartilha Manaus com fonte, data, unidade e previsão claramente identificadas', () => {
  const result = model();
  assert.equal(result.temperature,'31°C');
  assert.match(result.text,/Manaus \/ AM/);
  assert.match(result.text,/30\/09\/2026 às 10:00 · horário local/);
  assert.match(result.text,/Máxima prevista: 34°C/);
  assert.match(result.text,/Chance de chuva no dia: 70%/);
  assert.match(result.text,/estimada por modelo/);
  assert.match(result.text,/MET Norway \+ Open-Meteo/);
  assert.equal(result.url,'https://pluviaweather.com.br/?city=1302603');
  assert.doesNotMatch(result.text,/latitude|longitude|-60\.022|-3\.119/);
});
test('converte timestamps UTC para o fuso de Manaus e Curitiba', () => {
  const manaus = snapshot(); manaus.current.time = '2026-09-30T14:00:00Z';
  const curitiba = snapshot('4106902','Curitiba','PR','America/Sao_Paulo');
  curitiba.current.time = '2026-09-30T14:00:00Z'; curitiba.current.temperature = 12;
  assert.match(model(manaus).timing,/10:00/);
  assert.match(model(curitiba).timing,/11:00/);
  assert.match(model(curitiba).text,/Curitiba \/ PR\n12°C/);
});
test('mantém zero válido e omite campos ausentes sem inventar condição, chuva ou temperatura', () => {
  const partial = snapshot();
  partial.current.temperature = 0; partial.current.apparentTemperature = null; partial.current.weatherCode = null;
  partial.daily = [{time:'2026-09-29',temperatureMax:34,temperatureMin:25,precipitationProbabilityMax:70}];
  const result = model(partial);
  assert.equal(result.temperature,'0°C');
  assert.equal(result.icon,null);
  assert.equal(result.condition,'Condição indisponível');
  assert(result.metrics.every(metric => metric.value === '—'));
  assert.doesNotMatch(result.text,/Sensação:|Máxima prevista:|Mínima prevista:|70%|Céu limpo/);
  assert.equal(share.createModel(null),null);
  for (const value of [undefined,null,NaN,'31',Infinity]) {
    partial.current.temperature = value; assert.equal(model(partial),null);
  }
});
test('identifica cache e dados envelhecidos mesmo quando o snapshot antes era atual', () => {
  const saved = snapshot(); saved.source.freshness = 'stale';
  assert.match(model(saved).text,/sem confirmação atual/);
  assert.equal(model(snapshot(),{dataAt:now-31*60000}).stale,true);
  assert.equal(model(snapshot(),{stale:true}).stale,true);
  assert.equal(model(snapshot(),{now:now+31*60000}).stale,true);
  assert.equal(model().stale,false);
});
test('links aceitam apenas identificadores municipais e não incluem posição do aparelho', () => {
  assert.equal(share.cityIdFromURL('https://pluviaweather.com.br/?city=4106902'),'4106902');
  for (const query of ['city=abc','city=1302603<script>','city=-3.119,-60.022','city=123','']) {
    assert.equal(share.cityIdFromURL('https://pluviaweather.com.br/?'+query),null);
  }
  assert.equal(share.cityURL('invalid'),'https://pluviaweather.com.br/');
});
test('seleciona arquivo PNG somente com suporte; sempre preserva texto, fonte e link', () => {
  const result = model(), file = {name:'clima.png'};
  assert.deepEqual(share.sharePayload(result,file,{canShare:() => true}).files,[file]);
  for (const navigator of [{},{canShare:() => false},{canShare:() => {throw new Error('policy');}}]) {
    const payload = share.sharePayload(result,file,navigator);
    assert.equal(payload.files,undefined); assert.equal(payload.text,result.text);
  }
});

function ui(navigator = {}) {
  const nodes = new Map(), callbacks = [];
  function element(id) {
    if (nodes.has(id)) return nodes.get(id);
    const node = {id,events:{},hidden:false,disabled:false,open:false,
      addEventListener(name,fn) {this.events[name] = fn;},
      removeAttribute(name) {delete this[name];},
      showModal() {this.open = true;},
      close() {this.open = false; this.events.close?.();},
      focus() {this.focused = true;}, select() {this.selected = true;}
    };
    nodes.set(id,node); return node;
  }
  let current = model(), sequence = 0;
  const events = {}, revoked = [], ctx = {
    createLinearGradient:() => ({addColorStop(){}}), fillRect(){}, beginPath(){}, arc(){}, fill(){}, fillText(){}, drawImage(){}, roundRect(){}
  };
  const root = {
    navigator, URL:{createObjectURL:() => 'blob:'+ ++sequence, revokeObjectURL:url => revoked.push(url)}, File,
    Image:class {set src(value) {this.onerror?.();}},
    setTimeout, clearTimeout, addEventListener:(name,fn) => {events[name] = fn;},
    document:{getElementById:element,createElement:() => ({width:0,height:0,getContext:() => ctx,toBlob:fn => callbacks.push(fn)})}
  };
  share.mount(root,() => current);
  return {nodes,events,revoked,root,setModel:value => {current = value;}, fire:(id,name='click') => element(id).events[name](),
    finish:() => callbacks.shift()?.(new Blob(['png'],{type:'image/png'}))};
}
const tick = () => new Promise(resolve => setImmediate(resolve));
test('troca de cidade durante geração descarta o cartão antigo e libera URLs ao fechar', async () => {
  const app = ui(); const pending = app.fire('openWeatherShare'); await tick();
  app.setModel(null); app.events['pluvia:city-changed'](); app.finish(); await pending;
  assert.equal(app.nodes.get('weatherSharePreview').hidden,true);
  assert.equal(app.nodes.get('openWeatherShare').disabled,true);
  assert.equal(app.nodes.get('weatherShareSave').disabled,true);
  app.setModel(model(snapshot('4106902','Curitiba','PR','America/Sao_Paulo')));
  app.events['pluvia:weather-updated']();
  const next = app.fire('openWeatherShare'); await tick(); app.finish(); await next;
  assert.match(app.nodes.get('weatherSharePreview').alt,/Curitiba/);
  app.fire('weatherShareClose');
  assert.deepEqual(app.revoked,['blob:1']);
});
test('compartilhamento preserva o gesto, impede duplo envio e trata cancelamento sem enviar fallback', async () => {
  let calls = 0, reject;
  const app = ui({canShare:() => true,share:() => {calls++; return new Promise((_,fail) => {reject = fail;});}});
  const pending = app.fire('openWeatherShare'); await tick(); app.finish(); await pending;
  const send = app.fire('weatherShareNative');
  assert.equal(calls,1,'share é chamado antes de qualquer espera');
  await app.fire('weatherShareNative'); assert.equal(calls,1);
  reject(Object.assign(new Error('cancel'),{name:'AbortError'})); await send;
  assert.equal(app.nodes.get('weatherShareNative').disabled,false);
  assert.doesNotMatch(app.nodes.get('weatherShareStatus').textContent,/Não foi possível/);
});
test('clipboard indisponível permite selecionar manualmente o texto e atualização fecha preview antigo', async () => {
  const app = ui();
  const pending = app.fire('openWeatherShare'); await tick(); app.finish(); await pending;
  await app.fire('weatherShareCopy');
  assert.equal(app.nodes.get('weatherShareText').hidden,false);
  assert.equal(app.nodes.get('weatherShareText').selected,true);
  app.events['pluvia:weather-updated']();
  assert.equal(app.nodes.get('weatherShareDialog').open,false);
});
const appSource = fs.readFileSync('dist/app.js','utf8');
const initial = appSource.slice(appSource.indexOf('async function startInitialLocation()'),appSource.indexOf('\nsetupCityPicker();'));
function boot(url, cities = new Map(), resolveDetails = async () => null) {
  const selected = [], messages = []; let requests = 0;
  const context = vm.createContext({
    PLUVIA:{weatherShare:share},$:() => ({hidden:true}),location:{href:url},cityById:cities,cityChoiceAttempt:0,locationAttempt:0,activeCity:null,
    requestLocation:() => {requests++;},locationMessage:text => messages.push(text),
    ensureCityDetails:resolveDetails,chooseCity:(id,city) => {selected.push(city);context.activeCity=city;context.cityChoiceAttempt++;},
  });
  vm.runInContext(initial,context);
  return {context,selected,messages,requests:() => requests};
}
test('link de cidade abre a cidade compartilhada sem pedir GPS', async () => {
  const city = {id:'1302603',name:'Manaus'};
  const app = boot('https://pluviaweather.com.br/?city='+city.id,new Map([[city.id,city]]));
  await app.context.startInitialLocation();
  assert.deepEqual(app.selected,[city]); assert.equal(app.requests(),0);
  const regular = boot('https://pluviaweather.com.br/');
  await regular.context.startInitialLocation(); assert.equal(regular.requests(),1);
});
test('resolução de município compartilhado respeita escolha manual e pedido de localização posteriores', async () => {
  for (const intervention of ['choice','location']) {
    let resolve;
    const app = boot('https://pluviaweather.com.br/?city=1303403',new Map(),() => new Promise(done => {resolve=done;}));
    const pending = app.context.startInitialLocation();
    if (intervention === 'choice') app.context.cityChoiceAttempt++; else app.context.locationAttempt++;
    resolve({id:'1303403',name:'Parintins'}); await pending;
    assert.equal(app.selected.length,0);
  }
});
test('cidade compartilhada indisponível tem mensagem de recuperação sem seleção falsa', async () => {
  const app = boot('https://pluviaweather.com.br/?city=9999999');
  await app.context.startInitialLocation();
  assert.equal(app.selected.length,0); assert.equal(app.requests(),0);
  assert.match(app.messages.at(-1),/Escolha uma cidade/);
});
test('assets de compartilhamento estão versionados e incluídos no cache offline', () => {
  const html = fs.readFileSync('dist/index.html','utf8'), sw = fs.readFileSync('dist/sw.js','utf8');
  for (const asset of ['./modules/weather-share.js?v=share-1','./weather-share.css?v=share-1']) {
    assert(html.includes(asset)); assert(sw.includes(asset));
  }
  assert.match(sw,/pluvia-panel-46/);
});

test('falha de atualização fecha cartão aberto e preserva a identificação de dados salvos', async () => {
  const app = ui();
  const pending = app.fire('openWeatherShare'); await tick(); app.finish(); await pending;
  app.setModel(model(snapshot(),{stale:true})); app.events['pluvia:weather-status-changed']();
  assert.equal(app.nodes.get('weatherShareDialog').open,false);
  const next = app.fire('openWeatherShare'); await tick(); app.finish(); await next;
  assert.match(app.nodes.get('weatherShareText').value,/sem confirmação atual/);
});
test('bootstrap antigo não restaura cidade salva nem fallback quando existe link compartilhado', () => {
  const p0 = fs.readFileSync('dist/p0.js','utf8');
  const source = p0.slice(p0.indexOf('(function bootCity()'),p0.indexOf('if ("serviceWorker"'));
  for (const id of ['1302603','1303403','9999999']) {
    let chosen = 0, timers = 0;
    vm.runInNewContext(source,{
      PLUVIA:{weatherShare:share},location:{href:'https://pluviaweather.com.br/?city='+id},
      pinTop(){},readPreference:() => '4106902',cityById:new Map([['4106902',{id:'4106902'}]]),
      CITIES:[],chooseCity:() => chosen++,setTimeout:() => timers++,
    });
    assert.equal(chosen,0); assert.equal(timers,0);
  }
});
