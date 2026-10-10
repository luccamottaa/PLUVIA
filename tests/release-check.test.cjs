'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {manifest,check,verify}=require('../scripts/check-release.cjs');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
test('release check includes daily detail and versioned shell assets without external SDKs',()=>{
 const assets=manifest('dist');assert.equal(assets[0].file,'index.html');assert.ok(assets.some(a=>a.file==='sw.js'));
 assert.ok(assets.some(a=>a.file==='modules/daily-detail.js'));assert.ok(assets.every(a=>!a.url.startsWith('https:')));
 const conditions=assets.filter(a=>a.file.startsWith('assets/weather-icons/conditions/'));
 assert.equal(conditions.length,22);assert.ok(conditions.every(a=>a.url.endsWith('?v=modern-3')));
 assert.equal(assets.filter(a=>a.file.startsWith('assets/weather-icons/metrics/')).length,16);
});
test('HTTP 200 with stale content fails; retries only failed assets',async()=>{
 const assets=['a','b'].map(url=>({url,hash:digest(url)})),calls=[];let attempts=0;
 const fetchImpl=async url=>{const key=new URL(url).pathname.slice(1);calls.push(key);return new Response(key==='b' && !attempts++ ? 'stale' : key);};
 const results=await verify(assets,'https://site.test/',{fetchImpl,pause:async()=>{},attempts:2});
 assert.ok(results.every(r=>r.ok));assert.deepEqual(calls,['a','b','b']);
 assert.equal((await check(assets[0],'https://site.test/',async()=>new Response('wrong'))).ok,false);
});
test('limits simultaneous requests to the public domain',async()=>{
 const assets=Array.from({length:20},(_,i)=>({url:'f'+i,hash:digest('f'+i)}));let active=0,peak=0;
 const fetchImpl=async url=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,2));active--;return new Response(new URL(url).pathname.slice(1));};
 const results=await verify(assets,'https://site.test/',{fetchImpl,pause:async()=>{},concurrency:3});
 assert.ok(results.every(r=>r.ok));assert.equal(results.length,20);assert.equal(peak,3);
});
test('network failure and timeout remain explicit',async()=>{
 const result=await check({url:'sw.js',hash:'unused'},'https://site.test/',async()=>{throw new DOMException('Slow','TimeoutError');});
 assert.equal(result.ok,false);assert.equal(result.code,'timeout');
});
