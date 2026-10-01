const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function worker({status=200,networkError=false,slowWrite=false}={}) {
 const events={},writes=[],stored=new Map();let release;
 const pending=slowWrite ? new Promise(resolve=>release=resolve) : Promise.resolve();
 const caches={open:async()=>({put:async(key,res)=>{writes.push(key);await pending;stored.set(String(key.url||key),res);}}),match:async key=>stored.get(String(key.url||key))};
 vm.runInNewContext(fs.readFileSync('dist/sw.js','utf8'),{self:{addEventListener:(name,fn)=>events[name]=fn},location:{origin:'https://pluviaweather.com.br'},caches,URL,Request,Response,fetch:async()=>{if(networkError)throw Error('offline');return new Response('fresh',{status});}});
 function request(url,mode='cors') {
  let response,lifetime;let synchronous=0;
  events.fetch({request:{method:'GET',url,mode},respondWith:p=>response=p,waitUntil:p=>{lifetime=p;synchronous++;}});
  return {response,lifetime,synchronous};
 }
 return {request,writes,release:()=>release?.(),stored};
}
test('SW responde imediatamente e mantém gravação viva até o cache concluir',async()=>{
 const w=worker({slowWrite:true});const req=w.request('https://pluviaweather.com.br/modules/share-weather.js?v=share-1');
 assert.equal(req.synchronous,1);assert.equal(await (await req.response).text(),'fresh');
 let finished=false;req.lifetime.then(()=>finished=true);await new Promise(r=>setImmediate(r));assert.equal(finished,false);
 w.release();await req.lifetime;assert.equal(finished,true);assert.equal(w.stored.size,1);
});
test('HTML e chunks municipais também aguardam persistência e erros HTTP não entram no cache',async()=>{
 for(const [url,mode] of [['https://pluviaweather.com.br/?source=pwa','navigate'],['https://pluviaweather.com.br/cities/am.js','cors']]) {
  const w=worker(),req=w.request(url,mode);await req.response;await req.lifetime;assert.equal(w.writes.length,1);
 }
 const w=worker({status:503}),req=w.request('https://pluviaweather.com.br/app.js');assert.equal((await req.response).status,503);await req.lifetime;assert.equal(w.writes.length,0);
});
test('SW usa shell salvo offline e nunca guarda APIs externas/Auth',async()=>{
 const w=worker({networkError:true});w.stored.set('./index.html',new Response('offline shell'));
 const req=w.request('https://pluviaweather.com.br/','navigate');assert.equal(await (await req.response).text(),'offline shell');await req.lifetime;
 const missing=w.request('https://pluviaweather.com.br/app.js');assert.equal((await missing.response).type,'error');await missing.lifetime;
 const foreign=w.request('https://dszyyrcvwrpyiypwyvxe.supabase.co/auth/v1/token');assert.equal(foreign.response,undefined);assert.equal(foreign.synchronous,0);
});
