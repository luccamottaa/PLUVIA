// Manual smoke check: real public AWC observations through the hosted function.
// Uses no account, database mutation, notification or lightning quota. Not a CI fixture test.
const assert=require('node:assert/strict');
const {capabilities,validateResult}=require('../dist/modules/nowcast.js');
const endpoint='https://dszyyrcvwrpyiypwyvxe.supabase.co/functions/v1/nowcast';
const origin='https://pluviaweather.com.br';
async function request(path='',options={}){return fetch(endpoint+path,{...options,headers:{Origin:origin,...options.headers},signal:AbortSignal.timeout(15000)});}
(async()=>{
 const cap=await request();assert.equal(cap.status,200);assert.equal(cap.headers.get('access-control-allow-origin'),origin);
 const manifest=await cap.json(),region=capabilities(manifest).find(r=>r.id==='manaus');assert.ok(region);
 const response=await request('?region=manaus&lat=-3.12&lon=-60.02');assert.equal(response.status,200);
 const result=validateResult(await response.json(),{region,point:{lat:-3.12,lon:-60.02}});
 assert.equal(result.mock,false);assert.equal(result.status,'INSUFFICIENT');assert.equal(result.inference,null);
 assert.equal(result.observation,null);assert.equal(result.eligibleForAlerts,false);
 assert.equal(result.sources.find(s=>s.type==='radar').status,'not_configured');
 assert.equal(result.stations.length,1,'AWC deve entregar um boletim real recente para validar a publicação');
 assert.equal(result.stations[0].stationId,'SBEG');assert.match(result.stations[0].source,/NOAA/);
 const invalid=await request('?region=manaus&mock=1');assert.equal(invalid.status,400);
 const precise=await request('?region=manaus&lat=-3.12345&lon=-60.02');assert.equal(precise.status,400);
 const outside=await request('?region=manaus&lat=-23.55&lon=-46.63');assert.equal(outside.status,200);
 assert.equal((await outside.json()).status,'OUTSIDE_COVERAGE');
 const denied=await request('',{headers:{Origin:'https://example.invalid'}});assert.equal(denied.status,403);
 const post=await request('',{method:'POST'});assert.equal(post.status,405);
 const preflight=await request('',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'GET'}});assert.equal(preflight.status,204);
 const cached=await request('?region=manaus&lat=-3.12&lon=-60.02');assert.equal(cached.status,200);
 const cachedData=await cached.json();assert.equal(cachedData.stations[0].observedAt,result.stations[0].observedAt);
 console.log(JSON.stringify({hosted:'PASS',checks:9,status:result.status,mock:result.mock,inference:result.inference,station:'SBEG',observedAt:new Date(result.stations[0].observedAt).toISOString(),ingestedAt:new Date(result.stations[0].ingestedAt).toISOString(),weather:result.stations[0].weather,source:result.stations[0].source},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
