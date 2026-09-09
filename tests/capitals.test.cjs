const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname,'..');
const html = fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
const source = fs.readFileSync(path.join(root,'dist/app.js'),'utf8');
const catalog = fs.readFileSync(path.join(root,'dist/municipalities.js'),'utf8') + '\n' + fs.readFileSync(path.join(root,'dist/capitals.js'),'utf8');
const storage = new Map();
const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id]) => [id, {
  innerHTML:'',textContent:'',value:'',className:'',dataset:{},style:{},events:{},attrs:{},
  classList:{add(){},remove(){},toggle(){}},
  setAttribute(key,value){this.attrs[key]=value;},
  focus(){}, showModal(){this.open=true;},close(){this.open=false;},
  addEventListener(key,fn){this.events[key]=fn;}
}]));
const context = vm.createContext({document:{getElementById:id=>nodes.get(id),querySelectorAll:()=>[]},
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
  Intl,Date,URL,AbortController,setTimeout,clearTimeout,navigator:{},
  DOMParser:class {parseFromString(text){return {documentElement:{textContent:text}};}}
});
vm.runInContext(catalog,context);
vm.runInContext(source.slice(0,source.lastIndexOf('\nsetupCityPicker();')),context);
const run = code => vm.runInContext(code,context);
assert.equal(run('activeCity'),null);
run('activeCity = cityById.get("1302603")');
const cities = run('CAPITALS');
const municipalities = run('CITIES');
assert.equal(municipalities.length,5571);
assert.equal(new Set(municipalities.map(c=>c.id)).size,5571);
for(const c of municipalities) {
  assert(/^\d{7}$/.test(c.id));
  assert(c.name && c.state && c.uf);
  assert(c.lat >= -34 && c.lat <= 6 && c.lon >= -74 && c.lon <= -32);
}
for(const zone of new Set(municipalities.map(c=>c.timezone))) assert.doesNotThrow(()=>new Intl.DateTimeFormat('pt-BR',{timeZone:zone}));
assert.equal(context.searchCities('Parintins','AM')[0].id,'1303403');
assert.equal(context.searchCities('sao gabriel am')[0].id,'1303809');
assert.equal(context.searchCities('Boa Esperança do Norte','MT')[0].id,'5101837');
const homonyms = context.searchCities('Bom Jesus').filter(c=>c.name==='Bom Jesus');
assert(homonyms.length > 1 && new Set(homonyms.map(c=>c.uf)).size > 1);
assert(context.searchCities('Bom Jesus','RS').every(c=>c.uf==='RS'));
assert.equal(context.nearestCity(-2.63741,-56.729).id,'1303403');
assert.equal(context.cityDate('2026-09-08T12:00',municipalities.find(c=>c.id==='1301407')).toISOString(),'2026-09-08T17:00:00.000Z');
assert.equal(context.cityDate('2026-09-08T12:00',municipalities.find(c=>c.id==='2605459')).toISOString(),'2026-09-08T14:00:00.000Z');
assert.equal(cities.length,27);
assert.equal(new Set(cities.map(c=>c.uf)).size,27);
assert.equal(new Set(cities.map(c=>c.id)).size,27);
for(const city of cities){
  const url = new URL(context.cityApi('https://api.open-meteo.com/v1/forecast',city));
  assert.equal(Number(url.searchParams.get('latitude')),city.lat);
  assert.equal(url.searchParams.get('timezone'),city.timezone);
  assert.equal(context.inmetArea({geocodes:city.id}),city.uf==='AM'?'Manaus':null);
  run('activeCity = CAPITALS.find(c=>c.id==='+JSON.stringify(city.id)+')');
  assert.equal(context.inmetArea({geocodes:city.id}),city.name);
  assert.equal(context.inmetArea({geocodes:'9999999',estados:city.state}),null);
  assert.equal(context.inmetArea({estados:city.state}),city.state+' · confirme a área no mapa');
  assert.equal(context.nearestCapital(city.lat,city.lon).id,city.id);
  run('activeCity = CAPITALS.find(c=>c.uf==="AM")');
}
for(const [uf,expected] of [['AM','2026-09-08T16:00:00.000Z'],['DF','2026-09-08T15:00:00.000Z'],['AC','2026-09-08T17:00:00.000Z']]){
  const city = cities.find(c=>c.uf===uf);
  assert.equal(context.cityDate('2026-09-08T12:00',city).toISOString(),expected);
}
assert.equal(context.cityDate('2026-09-08T12:00:00Z').toISOString(),'2026-09-08T12:00:00.000Z');
assert.throws(()=>context.nearestCapital(NaN,0));
run('activeCity = CAPITALS.find(c=>c.uf==="MT")');
assert.equal(context.inmetArea({estados:'Mato Grosso do Sul'}),null);
run('activeCity = CAPITALS.find(c=>c.uf==="AM")');
context.setupCityPicker();
nodes.get('citySearch').value='sao';context.renderCityOptions();
assert((nodes.get('citySelect').innerHTML.match(/<option /g)||[]).length <= 61);
assert(nodes.get('cityPickerStatus').textContent.includes('refinar'));
nodes.get('citySearch').value='sao paulo';context.renderCityOptions();
assert(nodes.get('citySelect').innerHTML.includes('São Paulo'));
assert(!nodes.get('citySelect').innerHTML.includes('Manaus'));
nodes.get('citySearch').value='zzzz';context.renderCityOptions();
assert(nodes.get('cityPickerStatus').textContent.includes('Nenhuma'));
nodes.get('citySearch').value='';context.renderCityOptions();
nodes.get('favoriteCity').events.click();
assert.equal(nodes.get('favoriteCity').attrs['aria-pressed'],'true');
assert.deepEqual(JSON.parse(storage.get('pluvia-favorites')),['1302603']);
context.cache({forecast:'manaus'});
run('activeCity = CAPITALS.find(c=>c.uf==="SP")');
assert.equal(context.cached(),null);
context.cache({forecast:'sao-paulo'});
assert(storage.get('pluvia-weather-1302603').includes('manaus'));
assert(storage.get('pluvia-weather-3550308').includes('sao-paulo'));
run('activeCity = CAPITALS.find(c=>c.uf==="AM")');

(async()=>{
  const pending=[];const rendered=[];const requests=[];
  context.fetchForecast=city=>new Promise(resolve=>pending.push({city,resolve}));
  context.fetchJson=async url=>{requests.push(url);return url.includes('/avisos/')?{hoje:[],futuro:[]}:url.includes('wp-json')?[]:{current:{us_aqi:10}};};
  context.render=data=>rendered.push(data.city);
  const old=context.refreshAll();
  context.chooseCity('5300108');
  assert.equal(pending.length,2); // Only old and selected capital, not all 27.
  assert.equal(nodes.get('cityName').textContent,'Brasília');
  assert.equal(storage.get('pluvia-city'),'"5300108"');
  pending[1].resolve({city:'Brasília'});
  await run('refreshInFlight');
  pending[0].resolve({city:'Manaus'});
  await old;
  assert.deepEqual(rendered,['Brasília']);
  assert(!nodes.get('defesaContent').innerHTML.includes('Prefeitura de Manaus'));
  assert(nodes.get('defesaContent').innerHTML.includes('ainda não está integrada'));
  assert(!requests.some(url=>url.includes('latitude=-3.119')&&url.includes('longitude=-47.883')));
  const beforeInterior = requests.length;
  context.chooseCity('1303403');
  assert.equal(nodes.get('cityName').textContent,'Parintins');
  assert.equal(context.inmetArea({geocodes:'1302603'}),null);
  assert.equal(context.inmetArea({geocodes:'1303403'}),'Parintins');
  pending[2].resolve({city:'Parintins'});
  await run('refreshInFlight');
  assert(!requests.slice(beforeInterior).some(url=>url.includes('manaus.am.gov.br')));
  nodes.get('favoriteCity').events.click();
  const reloaded=vm.createContext({localStorage:{getItem:key=>storage.get(key)},Set});
  vm.runInContext(catalog,reloaded);
  assert.equal(vm.runInContext('activeCity',reloaded),null);
  assert.equal(vm.runInContext('favorites.has("1302603")',reloaded),true);
  assert.equal(vm.runInContext('favorites.has("1303403")',reloaded),true);
  console.log('PASS 5,571 cities and 27 capitals: geographic IDs, homonyms, bounded search, four UTC offsets, nearest city, INMET isolation, Manaus-only municipal feed, saved favorites and stale-request isolation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
