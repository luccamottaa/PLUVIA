const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('supabase/functions/lightning/index.js','utf8');

function setup({configured=true, providerResult, providerStatus=200, cachedRow, databaseFails=false, writeStatus=204}={}) {
  let handler, providerCalls=0, reservations=0, cacheWrites=0;
  const secrets = configured ? {
    SUPABASE_URL:'https://database.example', SUPABASE_SERVICE_ROLE_KEY:'private-db-key',
    XWEATHER_CLIENT_ID:'private-id', XWEATHER_CLIENT_SECRET:'private-secret'
  } : {};
  const cached = new Map(cachedRow ? [['-3.10,-60.02',cachedRow]] : []);
  const fetch = async (url, options) => {
    const address=String(url);
    if (address.includes('/lightning/closest')) {
      providerCalls++;
      assert.match(address,/radius=40km/);
      const query=new URL(address).searchParams;assert.equal(query.get('from'),'-5minutes');assert.equal(query.get('to'),'now');
      if(providerStatus!==200)return new Response('Unavailable',{status:providerStatus});
      return Response.json(providerResult || {success:true,response:[{
        loc:{lat:-3.10,long:-60.02},ob:{timestamp:Math.floor(Date.now()/1000),pulse:{type:'CG'}},
        relativeTo:{distanceKM:2.1}
      }]});
    }
    if(databaseFails)return new Response('Database failure',{status:503});
    if (address.includes('rpc/reserve_lightning_call')) {
      reservations++;
      assert.equal(JSON.parse(options.body).p_limit,150);
      return Response.json(true);
    }
    if (address.includes('lightning_cache?on_conflict=')) {
      cacheWrites++;
      const row=JSON.parse(options.body); cached.set(row.location_key,row);
      return new Response(null,{status:writeStatus});
    }
    if (address.includes('lightning_cache?')) {
      const key=decodeURIComponent(address.match(/location_key=eq\.([^&]+)/)[1]);
      return Response.json(cached.has(key) ? [cached.get(key)] : []);
    }
    throw new Error(`Unexpected request: ${address}`);
  };
  vm.runInNewContext(code,{Deno:{env:{get:name=>secrets[name]},serve:fn=>{handler=fn;}},
    fetch,URL,Response,AbortSignal,Date,Map,Set,Number,String,Math,JSON,Error,console:{warn() {}}}, {filename:'lightning/index.js'});
  const request=(query='lat=-3.10&lon=-60.02',origin='https://pluviaweather.com.br') =>
    handler(new Request(`https://edge.example/functions/v1/lightning?${query}`,{headers:{Origin:origin}}));
  return {request,stats:()=>({providerCalls,reservations,cacheWrites})};
}

test('sem segredos falha fechado e não consulta provedor',async()=>{
  const app=setup({configured:false});
  const response=await app.request();
  assert.equal(response.status,503);
  assert.deepEqual(app.stats(),{providerCalls:0,reservations:0,cacheWrites:0});
});

test('valida origem e coordenadas antes de consumir cota',async()=>{
  const app=setup();
  assert.equal((await app.request('lat=-3&lon=-60','https://hostile.example')).status,403);
  assert.equal((await app.request('lat=99&lon=-60')).status,400);
  assert.deepEqual(app.stats(),{providerCalls:0,reservations:0,cacheWrites:0});
});

test('consulta sob demanda, normaliza, atribui e reutiliza cache',async()=>{
  const app=setup();
  const first=await app.request();
  assert.equal(first.status,200);
  const data=await first.json();
  assert.equal(data.source,'Vaisala Xweather');
  assert.equal(data.events[0].type,'CG');
  assert.equal(data.events[0].distanceKm,2.1);
  assert.doesNotMatch(JSON.stringify(data),/private-id|private-secret|private-db-key/);
  assert.equal((await app.request()).status,200);
  assert.deepEqual(app.stats(),{providerCalls:1,reservations:1,cacheWrites:1});
});

test('aviso explícito sem detecções é distinguido de erro do provedor',async()=>{
  const empty=setup({providerResult:{success:false,error:{code:'warn_no_data'},response:[]}});
  assert.equal((await (await empty.request()).json()).events.length,0);
  const failed=setup({providerResult:{success:false,error:{code:'unauthorized'},response:[]}});
  assert.equal((await failed.request()).status,503);
  assert.equal(failed.stats().cacheWrites,0);
});


test('consultas concorrentes da mesma área compartilham cota, com respostas e CORS independentes',async()=>{
 const app=setup();const responses=await Promise.all([app.request(),app.request('lat=-3.10&lon=-60.02','https://luccamottaa.github.io')]);
 assert.equal(responses[0].headers.get('Access-Control-Allow-Origin'),'https://pluviaweather.com.br');
 assert.equal(responses[1].headers.get('Access-Control-Allow-Origin'),'https://luccamottaa.github.io');
 assert.deepEqual(await responses[0].json(),await responses[1].json());assert.deepEqual(app.stats(),{providerCalls:1,reservations:1,cacheWrites:1});
});
test('cache malformado, antigo ou futuro não é publicado como observação',async()=>{
 for(const checkedAt of [Date.now(),Date.now()-600000,Date.now()+120000]) {
 const app=setup({cachedRow:{expires_at:new Date(Date.now()+600000).toISOString(),payload:{source:'Vaisala Xweather',checkedAt,windowMinutes:5,radiusKm:40,truncated:false,events:[{lat:null,lon:-60,time:Date.now()/1000,type:'CG',distanceKm:1}],private:'secret'}}});
 const response=await app.request();assert.equal(response.status,200);assert.doesNotMatch(JSON.stringify(await response.json()),/secret|null/);assert.equal(app.stats().providerCalls,1);
 }
});
test('cache válido é reconstruído pela allowlist sem renovar checkedAt',async()=>{
 const checkedAt=Date.now()-60000,payload={source:'Vaisala Xweather',checkedAt,windowMinutes:5,radiusKm:40,truncated:false,events:[],private:'secret'};
 const app=setup({cachedRow:{expires_at:new Date(Date.now()+600000).toISOString(),payload}});const response=await app.request();const data=await response.json();assert.equal(data.checkedAt,checkedAt);assert.equal(data.private,undefined);assert(Number(response.headers.get('cache-control').match(/max-age=(\d+)/)[1])<=240);assert.equal(app.stats().reservations,0);
});
test('falhas distinguem banco, autorização, limite e provedor sem expor segredos',async()=>{
 for(const [options,code] of [[{databaseFails:true},'database_unavailable'],[{providerStatus:401},'provider_not_authorized'],[{providerStatus:429},'provider_rate_limited'],[{providerStatus:500},'provider_unavailable'],[{providerResult:{success:true,response:[{loc:{lat:0,long:0},ob:{timestamp:0,pulse:{type:'CG'}},relativeTo:{distanceKM:1}}]}},'invalid_provider_data']]) {
 const app=setup(options),response=await app.request();assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:code});assert.equal(app.stats().cacheWrites,0);
 }
});

test('upsert return=minimal aceita corpo vazio em HTTP 200 e 201 sem invalidar consulta bem-sucedida',async()=>{
 for(const writeStatus of [200,201,204]) {
 const app=setup({writeStatus}),response=await app.request();assert.equal(response.status,200);assert.equal((await response.json()).source,'Vaisala Xweather');assert.equal((await app.request()).status,200);assert.equal(app.stats().providerCalls,1);
 }
});
