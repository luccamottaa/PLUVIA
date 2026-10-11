const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createClient} = require('../dist/modules/http-client.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');

function abortedFetch(_url, {signal}) {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once:true});
  });
}

test('cancelamento por troca de cidade não é tratado nem repetido como timeout', async () => {
  const client = createClient({fetchImpl:abortedFetch});
  const request = client.getJson('https://example.test/weather', {timeoutMs:1000});
  assert.equal(client.pendingCount(), 1);
  client.abortAll();
  await assert.rejects(request, error => error.code === 'cancelled' && error.retryable === false);
  assert.equal(client.pendingCount(), 0);
});

test('timeout, rate limit e JSON inválido têm códigos operacionais distintos', async () => {
  const timeoutClient = createClient({fetchImpl:abortedFetch});
  await assert.rejects(
    timeoutClient.getJson('https://example.test/weather', {timeoutMs:5}),
    error => error.code === 'timeout' && error.retryable === true
  );

  const rateClient = createClient({fetchImpl:async () => ({ok:false, status:429})});
  await assert.rejects(
    rateClient.getJson('https://example.test/weather'),
    error => error.code === 'rate_limited' && error.status === 429 && error.retryable === true
  );

  const invalidClient = createClient({fetchImpl:async () => ({ok:true, status:200, json:async () => { throw new SyntaxError('bad json'); }})});
  await assert.rejects(
    invalidClient.getJson('https://example.test/weather'),
    error => error.code === 'invalid_response' && error.retryable === true
  );
});

test('sucesso limpa o registro e preserva zero e falso recebidos no JSON', async () => {
  const payload = {temperature:0,isDay:false};
  const client = createClient({fetchImpl:async () => ({ok:true,status:200,json:async () => payload})});
  assert.deepEqual(await client.getJson('https://example.test/weather'), payload);
  assert.equal(client.pendingCount(), 0);
});

test('tendência de pressão exige três horas reais de histórico', () => {
  const insights=require('../dist/modules/weather-insights.js');
  assert.equal(insights.pressure({time:['2026-10-01T09:00','2026-10-01T10:00','2026-10-01T11:00','2026-10-01T12:00'],pressure_msl:[null,1000,1000,1002]},3),null);
  assert.doesNotMatch(app, /pressure_msl\?\.\[Math\.max\(0,start - 3\)\]/);
});

test('cancelamento e timeout durante leitura do corpo não viram JSON inválido', async () => {
  for (const timedOut of [false,true]) {
    const client = createClient({fetchImpl:async (_url,{signal}) => ({ok:true,status:200,json:() => new Promise((_resolve,reject) => {
      signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});
    })})});
    const request = client.getJson('https://example.test/weather',{timeoutMs:timedOut ? 5 : 1000});
    await Promise.resolve();
    if (!timedOut) client.abortAll();
    await assert.rejects(request,error=>error.code === (timedOut ? 'timeout' : 'cancelled') && error.retryable === timedOut);
    assert.equal(client.pendingCount(),0);
  }
});

test('sinal previamente cancelado não inicia fetch',async()=>{
  let calls=0;const signal=new AbortController();signal.abort();
  const client=createClient({fetchImpl:async()=>{calls++;}});
  await assert.rejects(client.getJson('https://example.test/weather',{signal:signal.signal}),error=>error.code==='cancelled');
  assert.equal(calls,0);
});

test('serviços deduplicam consultas iguais e cancelam consultas ainda agendadas',async()=>{
  const {createServices}=require('../dist/modules/weather-services.js');
  let calls=0,resolve;
  const services=createServices({client:{getJson:()=>{calls++;return new Promise(done=>resolve=done);},abortAll(){}}});
  const city={lat:-3,lon:-60,timezone:'America/Manaus'};
  const a=services.weather.getForecast(city),b=services.weather.getForecast(city);
  assert.equal(a,b);await Promise.resolve();assert.equal(calls,1);
  resolve({ok:true});assert.deepEqual(await a,await b);
  const cancelled=services.weather.getForecast(city);services.abortAll();
  await assert.rejects(cancelled,error=>error.code==='cancelled');assert.equal(calls,1);
});

test('observabilidade de falhas preserva erros e exclui URL, coordenadas e cancelamento',async()=>{
 const events=[];global.pluviaAnalytics={reportFailure:props=>events.push(props)};
 try {
  const client=createClient({fetchImpl:async()=>({ok:false,status:503})});
  await assert.rejects(client.getJson('https://api.open-meteo.com/v1/forecast?latitude=-3.1&longitude=-60.02'),error=>error.code==='provider_unavailable');
  assert.deepEqual(events,[{component:'weather',error_code:'provider_unavailable',status:503,error_type:'RequestError'}]);
  await assert.rejects(client.getJson('https://unknown.example/?secret=value'));assert.equal(events.length,1);
  const cancellation=createClient({fetchImpl:abortedFetch}),controller=new AbortController();controller.abort();
  await assert.rejects(cancellation.getJson('https://api.open-meteo.com/v1/forecast',{signal:controller.signal}),error=>error.code==='cancelled');assert.equal(events.length,1);
  global.pluviaAnalytics.reportFailure=()=>{throw Error('telemetry unavailable');};
  await assert.rejects(client.getJson('https://api.open-meteo.com/v1/forecast'),error=>error.code==='provider_unavailable');
 } finally {delete global.pluviaAnalytics;}
});

test('falha de rede com o app em segundo plano não vira telemetria nem repetição',async()=>{
 const events=[];global.pluviaAnalytics={reportFailure:props=>events.push(props)};
 const doc=new EventTarget();doc.hidden=false;global.document=doc;
 try {
  let fail;const client=createClient({fetchImpl:()=>new Promise((_,reject)=>{fail=reject;})});
  const request=client.getJson('https://dszyyrcvwrpyiypwyvxe.supabase.co/functions/v1/met-forecast');
  doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));doc.hidden=false;
  fail(new TypeError('Load failed'));
  await assert.rejects(request,error=>error.code==='network_error' && error.background===true);
  assert.equal(events.length,0);
  const later=createClient({fetchImpl:async()=>{throw new TypeError('Load failed');}});
  await new Promise(resolve=>setTimeout(resolve,2));
  await assert.rejects(later.getJson('https://api.open-meteo.com/v1/forecast'),error=>error.code==='network_error' && !error.background);
  assert.deepEqual(events,[{component:'weather',error_code:'network_error',status:0,error_type:'RequestError'}]);
 } finally {delete global.pluviaAnalytics;delete global.document;}
});

test('consulta cortada pela recarga da atualização não vira telemetria',async()=>{
 const events=[];global.pluviaAnalytics={reportFailure:props=>events.push(props)};
 try {
  global.PLUVIA={...(global.PLUVIA||{}),reloading:true};
  const client=createClient({fetchImpl:async()=>{throw new TypeError('Load failed');}});
  await assert.rejects(client.getJson('https://dszyyrcvwrpyiypwyvxe.supabase.co/functions/v1/met-forecast'),error=>error.code==='network_error' && error.background===true);
  assert.equal(events.length,0);
  global.PLUVIA.reloading=false;
  await assert.rejects(client.getJson('https://api.open-meteo.com/v1/forecast'),error=>error.code==='network_error' && !error.background);
  assert.equal(events.length,1);
 } finally {delete global.pluviaAnalytics;delete global.PLUVIA;}
});
