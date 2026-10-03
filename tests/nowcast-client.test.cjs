const test=require('node:test'),assert=require('node:assert/strict');
const {createController,validateResult,capabilities,localOrigin,stationText}=require('../dist/modules/nowcast.js');
const {evaluate}=require('../supabase/functions/_shared/nowcast/engine.js');
const {fixture,region,M}=require('./support/nowcast-fixtures.cjs');
const NOW=Date.UTC(2026,9,3,3),city={id:'1302603',name:'Manaus',uf:'AM',...region.center},point={lat:-3.12,lon:-60.02};
const manifest={schemaVersion:1,regions:[region]};
const result=(now=NOW,mock=false)=>evaluate({...fixture('approaching',now,{mock}),location:{...point,reference:'municipality'}},{now,allowMock:mock});
const flush=()=>new Promise(r=>setImmediate(r));
test('capabilities configure coverage once; outside cities never query providers',async()=>{
 const urls=[],client=createController({clock:()=>NOW,getJson:async url=>{urls.push(url);return manifest;}});
 await client.refresh({...city,id:'3550308',lat:-23.55,lon:-46.63});await client.refresh({...city,id:'3304557',lat:-22.9,lon:-43.2});
 assert.equal(urls.length,1);assert.equal(client.get(),null);assert.equal(client.regionFor(city).id,'manaus');
 assert.throws(()=>capabilities({schemaVersion:1,regions:[{...region,bounds:{}}]}),/invalid_response/);
});
test('central refresh deduplicates and bounds point precision to municipal hundredths',async()=>{
 let calls=0;const client=createController({clock:()=>NOW,getJson:async url=>{calls++;if(!new URL(url).search)return manifest;
   assert.equal(new URL(url).searchParams.get('lat'),'-3.12');return result();}});
 await Promise.all([client.refresh(city),client.refresh(city),client.refresh(city)]);assert.equal(calls,2);
 await client.refresh(city);assert.equal(calls,2);assert.equal(client.get().status,'APPROACHING');
});
test('A to B to A rejects both late responses; abort is independent of forecast/map',async()=>{
 const requests=[],changes=[];
 const client=createController({clock:()=>NOW,onChange:x=>changes.push(x),getJson:(url,options)=>!new URL(url).search?Promise.resolve(manifest):new Promise(resolve=>requests.push({resolve,options}))});
 const first=client.refresh(city);await flush();
 const other={...city,id:'1303535',lat:-3.1,lon:-60.03},second=client.refresh(other);await flush();
 const third=client.refresh(city);await flush();assert.equal(requests.length,3);assert.equal(requests[0].options.signal.aborted,true);
 requests[0].resolve(result());await first;assert.equal(client.get(),null);
 requests[1].resolve(result());await second;assert.equal(client.get(),null);
 requests[2].resolve(result());await third;assert.equal(client.get().location.lon,point.lon);
 assert.equal(changes.at(-1).city.id,city.id);
});
test('same-city refresh keeps valid observations, but expiry immediately suppresses ETA',async()=>{
 let now=NOW,failed=false;const client=createController({clock:()=>now,getJson:async url=>{
   if(!new URL(url).search)return manifest;if(failed)throw Object.assign(new Error(),{code:'timeout'});return result();}});
 await client.refresh(city);failed=true;now+=M;await client.refresh(city,{force:true});assert.ok(client.get().inference.arrival);
 now+=5*M;client.tick();assert.equal(client.get().stale,true);assert.equal(client.get().inference,null);assert.equal(client.get().stations.length,1);
 now+=90*M;assert.equal(client.get().stations.length,0);
});
test('production rejects simulated results even if a server incorrectly emits them',()=>{
 assert.throws(()=>validateResult(result(NOW,true),{region,point,now:NOW}),/invalid_response/);
 assert.equal(validateResult(result(NOW,true),{region,point,now:NOW,allowMock:true}).mock,true);
 assert.equal(localOrigin(new URL('https://pluviaweather.com.br')),false);assert.equal(localOrigin(new URL('http://localhost.evil.test')),false);
 assert.equal(localOrigin(new URL('http://127.0.0.1:4174')),true);
});
test('client refuses old, mismatched, invalid and false-high-confidence responses',()=>{
 const patches=[r=>r.location.lon=-61,r=>r.confidence.level='HIGH',r=>r.validUntil=NOW+10*M,
  r=>r.evaluatedAt=NOW-7*M,r=>r.stations[0].observedAt=NOW+2*M,r=>r.inference.kind='observation',r=>r.inference.arrival.latestMinutes=200];
 for(const change of patches){const r=result();change(r);assert.throws(()=>validateResult(r,{region,point,now:NOW}),/invalid_response/);}
 assert.match(stationText(result().stations[0]),/boletim não informa chuva/);
});
