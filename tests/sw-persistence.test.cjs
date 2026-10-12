const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function worker({status=200,networkError=false,slowWrite=false}={}) {
 const events={},writes=[],stored=new Map(),fetches={count:0};let release;
 const pending=slowWrite ? new Promise(resolve=>release=resolve) : Promise.resolve();
 const caches={open:async()=>({put:async(key,res)=>{writes.push(key);await pending;stored.set(String(key.url||key),res);}}),match:async key=>stored.get(String(key.url||key))};
 vm.runInNewContext(fs.readFileSync('dist/sw.js','utf8'),{self:{addEventListener:(name,fn)=>events[name]=fn},location:{origin:'https://pluviaweather.com.br'},caches,URL,Request,Response,fetch:async()=>{fetches.count++;if(networkError)throw Error('offline');return new Response('fresh',{status});}});
 function request(url,mode='cors') {
  let response,lifetime;let synchronous=0;
  events.fetch({request:{method:'GET',url,mode},respondWith:p=>response=p,waitUntil:p=>{lifetime=p;synchronous++;}});
  return {response,lifetime,synchronous};
 }
 return {request,writes,release:()=>release?.(),stored,fetches};
}
test('SW responde imediatamente e mantém gravação viva até o cache concluir',async()=>{
 const w=worker({slowWrite:true});const req=w.request('https://pluviaweather.com.br/modules/share-weather.js?v=share-7');
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
 const api=w.request('https://pluviaweather.com.br/api/local-dev?x=1');assert.equal(api.response,undefined);assert.equal(api.synchronous,0);
});
test('página de Termos fica em cache na própria URL, sem substituir o shell da Home',async()=>{
 const w=worker();const page=w.request('https://pluviaweather.com.br/termos/','navigate');await page.response;await page.lifetime;
 assert.equal(w.stored.has('./index.html'),false,'os Termos não viram o shell');
 assert.equal(w.stored.has('https://pluviaweather.com.br/termos/'),true);
});
test('páginas das capitais ficam em cache na própria URL, sem substituir o shell da Home',async()=>{
 const w=worker();const page=w.request('https://pluviaweather.com.br/clima/manaus-am/','navigate');await page.response;await page.lifetime;
 assert.equal(w.stored.has('./index.html'),false,'a página de Manaus não vira o shell');
 assert.equal(w.stored.has('https://pluviaweather.com.br/clima/manaus-am/'),true);
 const offline=worker({networkError:true});offline.stored.set('./index.html',new Response('offline shell'));
 const missing=offline.request('https://pluviaweather.com.br/clima/belem-pa/','navigate');assert.equal(await (await missing.response).text(),'offline shell','sem cópia da página, o shell abre offline');await missing.lifetime;
 offline.stored.set('https://pluviaweather.com.br/clima/belem-pa/',new Response('belem salvo'));
 const saved=offline.request('https://pluviaweather.com.br/clima/belem-pa/','navigate');assert.equal(await (await saved.response).text(),'belem salvo');await saved.lifetime;
});
test('JS/CSS versionados (?v=) saem do cache sem ir à rede; sem versão continuam buscando a rede',async()=>{
 const w=worker();const url='https://pluviaweather.com.br/app.js?v=panel-1';
 w.stored.set(url,new Response('salvo'));
 const hit=w.request(url);assert.equal(await (await hit.response).text(),'salvo');await hit.lifetime;assert.equal(w.fetches.count,0);
 const miss=w.request('https://pluviaweather.com.br/styles.css?v=core-1');assert.equal(await (await miss.response).text(),'fresh');await miss.lifetime;
 assert.equal(w.fetches.count,1);assert.equal(w.stored.has('https://pluviaweather.com.br/styles.css?v=core-1'),true);
 const plain=w.request('https://pluviaweather.com.br/app.js');await plain.response;await plain.lifetime;assert.equal(w.fetches.count,2);
 const offline=worker({networkError:true});const gone=offline.request('https://pluviaweather.com.br/p0.js?v=x');assert.equal((await gone.response).type,'error');await gone.lifetime;
});
