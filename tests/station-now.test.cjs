const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('supabase/functions/station-now/index.js','utf8');
const feature = (station, coords, time, name, value, period) => ({type:'Feature',geometry:{type:'Point',coordinates:coords},
  properties:{wigos_station_identifier:station,reportTime:time,name,value,phenomenonTime:period || time}});
function load(fetchImpl) {
  let handle;
  const context = vm.createContext({URL,Date,Response,AbortSignal,Map,Set,Math,Number,String,JSON,
    Deno:{serve:fn=>{handle=fn;}}, fetch:fetchImpl});
  vm.runInContext(source,context);
  return handle;
}
const request = (query = 'lat=-3.1199&lon=-60.0217', origin = 'https://pluviaweather.com.br', ip = '192.0.2.1') =>
  new Request(`https://example.supabase.co/functions/v1/station-now?${query}`,{headers:{origin,'x-real-ip':ip}});

test('estação do INMET mais próxima, leitura mais recente com temperatura, unidades e chuva só de 1 h', async () => {
  const now = Date.now(), hour = new Date(Math.floor(now / 3600_000) * 3600_000), at = hour.toISOString();
  const before = new Date(hour.getTime() - 3600_000).toISOString(), period = `${before}/${at}`;
  const manaus = '0-76-0-1302603000000003', far = '0-76-0-1301902000000001', near = '0-76-0-1303569000000002';
  const features = [
    feature(manaus,[-60.01639,-3.10333,62.8],at,'air_temperature',30.7),
    feature(manaus,[-60.01639,-3.10333],at,'relative_humidity',62),
    feature(manaus,[-60.01639,-3.10333],at,'total_precipitation_or_total_water_equivalent',1.2,period),
    feature(manaus,[-60.01639,-3.10333],at,'wind_speed',0.7,period),
    feature(manaus,[-60.01639,-3.10333],at,'maximum_wind_gust_speed',2.1,period),
    feature(manaus,[-60.01639,-3.10333],before,'air_temperature',31.2),
    // Mais perto, porém sem temperatura válida: não serve.
    feature(near,[-60.02,-3.12],at,'air_temperature',null),
    // Fora do raio de 30 km.
    feature(far,[-60.6,-3.3],at,'air_temperature',29),
  ];
  const requests = [];
  const handle = load(async (url, options) => { requests.push({url:String(url),options}); return new Response(JSON.stringify({type:'FeatureCollection',features}),{status:200}); });
  const response = await handle(request());
  assert.equal(response.status,200);
  assert.equal(response.headers.get('access-control-allow-origin'),'https://pluviaweather.com.br');
  assert.match(response.headers.get('cache-control'),/max-age=600/);
  const data = await response.json();
  assert.equal(data.source,'INMET');
  assert.deepEqual(data.station,{ibge:'1302603',distanceKm:1.9});
  assert.equal(data.time,at);
  assert.equal(data.temperatureC,30.7);
  assert.equal(data.humidity,62);
  assert.equal(data.rainMm,1.2);
  assert.equal(data.windKmh,3);
  assert.equal(data.gustKmh,8);
  assert.match(requests[0].url,/wis2bra\.inmet\.gov\.br\/oapi\/collections\/urn:wmo:md:br-inmet:synop\/items\?f=json&bbox=/);
  assert.match(requests[0].url,/datetime=\d{4}-\d{2}-\d{2}T\d{2}%3A\d{2}%3A\d{2}Z%2F\.\./);
  assert.match(requests[0].options.headers['User-Agent'],/PLUVIA\/1\.0/);
  // Mesma cidade nos próximos 10 min: cache, sem nova consulta.
  await (await handle(request('lat=-3.1199&lon=-60.0217','https://pluviaweather.com.br','192.0.2.2'))).json();
  assert.equal(requests.length,1);
});

test('leitura velha, futura ou de outro tamanho de acumulado não vira "agora"; ausência é estação nula', async () => {
  const now = Date.now(), old = new Date(now - 3 * 3600_000).toISOString(), future = new Date(now + 3600_000).toISOString();
  const recent = new Date(Math.floor(now / 3600_000) * 3600_000).toISOString();
  const sixHours = `${new Date(Date.parse(recent) - 6 * 3600_000).toISOString()}/${recent}`;
  const id = '0-76-0-1302603000000003', coords = [-60.016,-3.103];
  const handle = load(async () => new Response(JSON.stringify({features:[
    feature(id,coords,old,'air_temperature',25), feature(id,coords,future,'air_temperature',26),
    feature(id,coords,recent,'air_temperature','29.5'), feature(id,coords,recent,'total_precipitation_or_total_water_equivalent',8,sixHours),
    feature(id,coords,recent,'relative_humidity',140),
  ]}),{status:200}));
  const data = await (await handle(request())).json();
  assert.equal(data.temperatureC,29.5);
  assert.equal(data.rainMm,null,'acumulado de 6 h não vira chuva da última hora');
  assert.equal(data.humidity,null,'fora da faixa vira ausente');
  const empty = load(async () => new Response(JSON.stringify({features:[feature(id,coords,old,'air_temperature',25)]}),{status:200}));
  assert.deepEqual(await (await empty(request('lat=-3.2&lon=-60.1'))).json(),{source:'INMET',station:null});
});

test('fora do Brasil, outra origem, método ou falha do provedor respondem com código fixo', async () => {
  const handle = load(async () => new Response('fora',{status:503}));
  assert.equal((await handle(request('lat=52&lon=13'))).status,400);
  assert.equal((await handle(request(undefined,'https://example.com'))).status,403);
  const failure = await handle(request('lat=-3.3&lon=-60.3'));
  assert.equal(failure.status,502);
  assert.deepEqual(await failure.json(),{error:'provider_unavailable'});
  const broken = load(async () => new Response('{"features":"x"}',{status:200}));
  assert.equal((await broken(request('lat=-3.4&lon=-60.4'))).status,502);
});

const client = require('../dist/modules/station-now.js');
test('app: só leitura recente com temperatura aparece, com texto da estação, hora local e chuva só quando informada', () => {
  const now = Date.parse('2026-10-13T04:00:00Z');
  const base = {station:{ibge:'1302603',distanceKm:1.8},time:'2026-10-13T03:00:00Z',temperatureC:30.7,humidity:62,rainMm:0};
  assert.equal(client.reading({...base,time:'2026-10-13T01:00:00Z'},now),null,'mais de 2h30');
  assert.equal(client.reading({...base,temperatureC:null},now),null);
  assert.equal(client.reading({...base,station:null},now),null);
  assert.equal(client.reading({...base,time:'2026-10-13T05:00:00Z'},now),null,'futura');
  const helpers = {cityName:id=>({'1302603':'Manaus','1303569':'Iranduba'})[id]||null,time:()=> '23:00',number:(n,d)=>n.toFixed(d).replace('.',',')};
  const manaus = {id:'1302603'};
  assert.deepEqual(client.describe(client.reading(base,now),manaus,helpers),{value:'30,7°',note:'Estação do INMET em Manaus · às 23:00 · umidade 62% · sem chuva na última hora'});
  const rainy = client.describe(client.reading({...base,rainMm:3.6,station:{ibge:'1303569',distanceKm:18.4}},now),manaus,helpers);
  assert.equal(rainy.note,'Estação do INMET em Iranduba, a 18 km · às 23:00 · umidade 62% · 3,6 mm na última hora');
  const far = client.describe(client.reading({...base,humidity:null,rainMm:null,station:{ibge:'1302603',distanceKm:12}},now),manaus,helpers);
  assert.equal(far.note,'Estação do INMET em Manaus, a 12 km do centro · às 23:00');
  assert.equal(client.describe(client.reading({...base,station:{ibge:'9999999',distanceKm:7}},now),manaus,helpers).note.startsWith('Estação do INMET, a 7 km'),true);
  assert.match(client.requestUrl({lat:-3.119,lon:-60.0217}),/station-now\?lat=-3\.12&lon=-60\.02$/);
  assert.equal(client.requestUrl({lat:null}),null);
});
test('app: cartão escondido até a leitura, some na troca de cidade e entra no fim das leituras', () => {
  const html = fs.readFileSync('dist/index.html','utf8'), css = fs.readFileSync('dist/continuous.css','utf8'), sw = fs.readFileSync('dist/sw.js','utf8');
  assert.match(html,/<article class="metric station-metric panel card-detail" id="stationNow" aria-labelledby="stationNowTitle" hidden>/);
  assert.match(html,/id="airQualityCard">[\s\S]*?<\/article>\n\s*<article class="metric station-metric/,'depois do ar, sem empurrar o topo');
  assert.match(html,/modules\/station-now\.js\?v=station-2/);assert.match(sw,/modules\/station-now\.js\?v=station-2/);
  assert.match(css,/#weatherView \.metrics \.station-metric\[hidden\] \{ display:none; \}/);
  const source = fs.readFileSync('dist/modules/station-now.js','utf8');
  assert.match(source,/'pluvia:city-changed', \(\) => \{ revision\+\+; pendingCity = null; controller\?\.abort\?\.\(\); hide\(\); \}/);
  assert.doesNotMatch(source,/geolocation|getCurrentPosition/,'nunca GPS');
});
