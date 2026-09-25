const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('supabase/functions/lightning/index.js','utf8');

function setup({configured=true, providerResult}={}) {
  let handler, providerCalls=0, reservations=0, cacheWrites=0;
  const secrets = configured ? {
    SUPABASE_URL:'https://database.example', SUPABASE_SERVICE_ROLE_KEY:'private-db-key',
    XWEATHER_CLIENT_ID:'private-id', XWEATHER_CLIENT_SECRET:'private-secret'
  } : {};
  const cached = new Map();
  const fetch = async (url, options) => {
    const address=String(url);
    if (address.includes('/lightning/closest')) {
      providerCalls++;
      assert.match(address,/radius=40km/);
      return Response.json(providerResult || {success:true,response:[{
        loc:{lat:-3.10,long:-60.02},ob:{timestamp:Math.floor(Date.now()/1000),pulse:{type:'CG'}},
        relativeTo:{distanceKM:2.1}
      }]});
    }
    if (address.includes('rpc/reserve_lightning_call')) {
      reservations++;
      assert.equal(JSON.parse(options.body).p_limit,150);
      return Response.json(true);
    }
    if (address.includes('lightning_cache?on_conflict=')) {
      cacheWrites++;
      const row=JSON.parse(options.body); cached.set(row.location_key,row);
      return new Response(null,{status:204});
    }
    if (address.includes('lightning_cache?')) {
      const key=decodeURIComponent(address.match(/location_key=eq\.([^&]+)/)[1]);
      return Response.json(cached.has(key) ? [cached.get(key)] : []);
    }
    throw new Error(`Unexpected request: ${address}`);
  };
  vm.runInNewContext(code,{Deno:{env:{get:name=>secrets[name]},serve:fn=>{handler=fn;}},
    fetch,URL,Response,AbortSignal,Date,Map,Set,Number,String,Math,JSON,Error}, {filename:'lightning/index.js'});
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
