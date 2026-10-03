const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeMetar,metarWeather,WeatherStationProvider,createCollector}=require('../supabase/functions/_shared/nowcast/providers.js');
const {createHandler}=require('../supabase/functions/_shared/nowcast/service.js');
const {fixture,region,M}=require('./support/nowcast-fixtures.cjs');
const NOW=Date.UTC(2026,9,3,3,0),row={icaoId:'SBEG',metarType:'METAR',obsTime:NOW/1000-300,lat:-3.039,lon:-60.05,
  temp:25,dewp:24,wspd:2,wdir:'VRB',altim:1010,wxString:'-TSRA'};
const request=(query='region=manaus',options={})=>new Request('https://example.test/nowcast?'+query,options);
test('METAR preserves observation time, station location, units and variable wind',()=>{
  const [s]=normalizeMetar([row],region,NOW);assert.equal(s.observedAt,row.obsTime*1000);assert.equal(s.windKmh,3.7);
  assert.equal(s.windFromDegrees,null);assert.equal(s.weather.rain,'reported');assert.equal(s.weather.thunderstorm,'reported');
  assert.equal(s.weather.intensity,'light');assert.equal(s.altimeterHpa,1010);assert.equal(s.rawOb,undefined);
});
test('vicinity and missing report are distinct from rain at a station and observed dryness',()=>{
  assert.equal(metarWeather('VCTS VCSH').thunderstorm,'vicinity');assert.equal(metarWeather('VCRA').rain,'vicinity');
  assert.equal(metarWeather(null).rain,'not_reported');assert.equal(metarWeather('+RA').intensity,'strong');
});
test('METAR invalid payloads, future times and unrequested stations fail; stale is discarded',()=>{
  for(const changed of [{obsTime:'100'},{icaoId:'WRONG'},{lat:null},{obsTime:NOW/1000+120},{wxString:'<script>'}])
    assert.throws(()=>normalizeMetar([{...row,...changed}],region,NOW),/invalid_response/);
  assert.deepEqual(normalizeMetar([{...row,obsTime:NOW/1000-91*60}],region,NOW),[]);
  assert.equal(normalizeMetar([row,{...row,obsTime:row.obsTime-600}],region,NOW).length,1);
});
test('provider calls fixed AWC endpoint, not model data, with bounded station IDs',async()=>{
  let url;const p=new WeatherStationProvider({clock:()=>NOW,fetchImpl:async u=>{url=new URL(u);return new Response(JSON.stringify([row]));}});
  const r=await p.read(region);assert.equal(url.origin,'https://aviationweather.gov');assert.equal(url.searchParams.get('ids'),'SBEG');
  assert.equal(r.kind,'observation');assert.equal(r.status,'ready');
});
test('HTTP 204, 429 and malformed JSON have distinct outcomes',async()=>{
  const provider=response=>new WeatherStationProvider({clock:()=>NOW,fetchImpl:async()=>response});
  assert.equal((await provider(new Response(null,{status:204})).read(region)).status,'unavailable');
  await assert.rejects(provider(new Response(null,{status:429})).read(region),/rate_limited/);
  await assert.rejects(provider(new Response('<html>')).read(region),/invalid_response/);
});
test('each source times out independently without breaking a successful station provider',async()=>{
  let aborted=false;
  const providers=[{read:(_,{signal})=>new Promise(()=>signal.addEventListener('abort',()=>{aborted=true;}))},
    {read:async()=>({status:'ready',observations:[]})},{read:async()=>{throw new Error('invalid_response');}}];
  const result=await createCollector({providers,timeoutMs:10,clock:()=>NOW})(region);
  assert.equal(result.radar.reason,'timeout');assert.equal(result.stations.status,'ready');assert.equal(result.satellite.reason,'invalid_response');assert.ok(aborted);
});
test('backend shares one region collection across concurrent municipal requests',async()=>{
  let count=0;const collect=async()=>{count++;return fixture('radar-down',NOW,{mock:false});};
  const handler=createHandler({collect,clock:()=>NOW});
  const responses=await Promise.all([handler(request()),handler(request('region=manaus&lat=-3.12&lon=-60.02'))]);
  assert.equal(count,1);for(const r of responses) {assert.equal(r.status,200);const data=await r.json();assert.equal(data.status,'INSUFFICIENT');assert.equal(data.stations.length,1);}
  await handler(request());assert.equal(count,1);
});
test('capabilities expose configured regions without querying a weather provider',async()=>{
 let count=0;const handler=createHandler({collect:async()=>{count++;return {};}});
 const response=await handler(request(''));assert.equal(response.status,200);const value=await response.json();
 assert.equal(value.regions[0].id,'manaus');assert.equal(value.schemaVersion,1);assert.equal(count,0);
 assert.equal((await handler(request('region=manaus&region=manaus'))).status,400);
});
test('backend cache expiration refreshes original timestamps rather than aging them forward',async()=>{
  let now=NOW,count=0;const handler=createHandler({clock:()=>now,collect:async()=>{count++;return fixture('radar-down',NOW,{mock:false});}});
  const a=await (await handler(request())).json();now+=4*M;
  const b=await (await handler(request())).json();assert.equal(count,1);assert.equal(a.stations[0].observedAt,b.stations[0].observedAt);
  now+=2*M;await handler(request());assert.equal(count,2);
});
test('public handler rejects mock mode, unknown queries, precise GPS, foreign origins and writes',async()=>{
  let count=0;const handler=createHandler({clock:()=>NOW,collect:async()=>{count++;return fixture('approaching',NOW);}});
  assert.equal((await (await handler(request())).json()).status,'REJECTED_MOCK');
  for(const query of ['region=manaus&mock=true','region=manaus&url=https://evil.test','region=manaus&lat=-3.123456&lon=-60.02','region=manaus&lat=-3','region=unknown'])
    assert.equal((await handler(request(query))).status,400);
  assert.equal((await handler(request('region=manaus',{headers:{origin:'https://evil.test'}}))).status,403);
  assert.equal((await handler(request('region=manaus',{method:'POST'}))).status,405);
  assert.equal((await handler(request('region=manaus',{method:'OPTIONS',headers:{origin:'https://pluviaweather.com.br'}}))).status,204);
  const outside=await (await handler(request('region=manaus&lat=0&lon=0'))).json();assert.equal(outside.status,'OUTSIDE_COVERAGE');assert.equal(count,1);
});
