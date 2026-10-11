const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync('dist/analytics.js','utf8');
function setup({choice='0',host='pluviaweather.com.br',dnt='0',gpc=false,offline=false,fetchImpl,performanceApi,release}={}) {
  const calls=[],windows={},documents={},nodes=new Map(),timers=new Map(),storage=new Map([['pluvia-analytics-consent-v1',choice]]);let tick=0;
  const node=id=>{if(!nodes.has(id))nodes.set(id,{checked:false,value:'',addEventListener(type,fn){this[type]=fn;},focus(){this.focused=true;},click(){this.click?.handler?.();}});return nodes.get(id);};
  const navigator={doNotTrack:dnt,globalPrivacyControl:gpc,onLine:!offline,userAgent:'Safari'};
  const window={crypto:webcrypto,addEventListener:(type,fn)=>{windows[type]=fn;},fetch:async(url,options)=>{calls.push({url,options,body:JSON.parse(options.body)});return fetchImpl ? fetchImpl(url,options) : {ok:true};}};
  const document={visibilityState:'visible',getElementById:node,addEventListener:(type,fn)=>{documents[type]=fn;},querySelector:selector=>selector==='meta[name="pluvia-release"]'&&release!==undefined?{getAttribute:()=>release}:null};
  vm.runInNewContext(source,{...(performanceApi||{}),window,navigator,location:{hostname:host},document,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},AbortController,Uint8Array,Date,setTimeout:fn=>{timers.set(++tick,fn);return tick;},clearTimeout:id=>timers.delete(id)});
  documents.DOMContentLoaded();
  return {api:window.pluviaAnalytics,calls,windows,documents,document,node,navigator,timers,storage};
}
test('coleta fica desligada antes de consentir e fora do domínio de produção',async()=>{
 for(const app of [setup(),setup({choice:'1',host:'localhost'}),setup({choice:'1',dnt:'1'}),setup({choice:'1',gpc:true})]) {
  app.api.track('City Selected');assert.equal(await app.api.flush(),false);assert.equal(app.calls.length,0);
 }
});
test('participação usa API pública sem SDK, perfil, conta, coordenadas ou texto livre',async()=>{
 const app=setup();app.api.setConsent(true);app.api.identify('private-account');
 app.api.track('City Selected',{city:'Manaus',uf:'AM',latitude:-3.1,email:'person@example.com',source:'location',nested:{token:'secret'}});
 app.api.track('Invented Event',{city:'Manaus'});await app.api.flush();
 assert.equal(app.calls.length,1);const {body,options,url}=app.calls[0];
 assert.match(url,/posthog\.com\/batch\/\?ip=0/);assert.match(body.api_key,/^phc_/);assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');
 assert.deepEqual(body.batch.map(e=>e.event),['PLUVIA Opened','City Selected']);
 assert.equal(body.batch[1].properties.source,'location');assert.equal(body.batch[1].properties.$process_person_profile,false);assert.equal(body.batch[1].properties.$geoip_disable,true);assert.equal(body.batch[1].properties.$ip,null);
 assert.doesNotMatch(JSON.stringify(body),/Manaus|person@example|private-account|latitude|secret/);
});
test('origem e motivo da localização chegam como valores da lista fechada',async()=>{
 const app=setup();app.api.setConsent(true);
 app.api.track('Location Requested',{source:'automatic'});app.api.track('Location Requested',{source:'notice'});
 app.api.track('Location Unavailable',{reason:'catalog'});app.api.track('Location Requested',{source:'https://x.test/'});await app.api.flush();
 const batch=app.calls.flatMap(c=>c.body.batch).filter(e=>e.event.startsWith('Location'));
 assert.deepEqual(batch.map(e=>e.properties.source ?? e.properties.reason ?? null),['automatic','notice','catalog',null]);
});
test('Comparar, Brasil agora e o convite de favoritar entram na lista fechada, sem propriedades',async()=>{
 const app=setup();app.api.setConsent(true);
 const names=['Compare Opened','Compare City Changed','Brazil Now Opened','Brazil Capital Chosen','Favorite Suggested','Favorite Suggestion Accepted','Favorite Suggestion Dismissed'];
 for(const name of names)app.api.track(name,{city:'Manaus'});await app.api.flush();await app.api.flush();
 const batch=app.calls.flatMap(c=>c.body.batch).filter(e=>names.includes(e.event));
 assert.deepEqual(batch.map(e=>e.event),names);assert.doesNotMatch(JSON.stringify(batch),/Manaus/);
});
test('somente o comprimento da busca é enviado e valores são limitados',async()=>{
 const app=setup({choice:'1'});app.node('citySearch').value='Manaus';app.node('citySearch').input({target:app.node('citySearch')});
 for(const [id,fn] of [...app.timers]){app.timers.delete(id);fn();}
 await app.api.flush();await app.api.flush();const all=app.calls.flatMap(c=>c.body.batch);assert.equal(all.find(e=>e.event==='City Searched').properties.query_length,6);assert.doesNotMatch(JSON.stringify(all),/Manaus/);
 assert.deepEqual(JSON.parse(JSON.stringify(app.api.sanitize({status:599,query_length:201,mode:'password',component:'weather',error_code:'timeout'}))),{status:599,component:'weather',error_code:'timeout'});
});
test('falhas são deduplicadas, cancelamento não é falha e coleta tem limite por visita',async()=>{
 const app=setup({choice:'1'});for(let i=0;i<20;i++)app.api.reportFailure({component:'weather',error_code:'timeout',status:503});app.api.reportFailure({component:'weather',error_code:'cancelled'});
 await app.api.flush();assert.equal(app.calls[0].body.batch.filter(e=>e.event==='App Failure').length,1);
 for(let i=0;i<1000;i++)app.api.track('City Selected');while(app.timers.size){await app.api.flush();if(app.calls.length>10)throw Error('Unbounded queue');}
 assert(app.calls.flatMap(c=>c.body.batch).length<=100);
});
test('offline preserva fila em memória e reconexão envia sem retry em loop',async()=>{
 const app=setup({choice:'1',offline:true});await app.api.flush();assert.equal(app.calls.length,0);app.navigator.onLine=true;await app.windows.online();await app.api.flush();assert.equal(app.calls.length,1);
 const failed=setup({choice:'1',fetchImpl:()=>Promise.reject(Error('offline'))});assert.equal(await failed.api.flush(),false);assert.equal(failed.calls.length,1);assert.equal(failed.timers.size,0);
});
test('revogar participação cancela envio pendente e descarta a fila',async()=>{
 let signal;const app=setup({choice:'1',fetchImpl:(_,options)=>new Promise((resolve,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(Error('abort')));})});
 const sending=app.api.flush();await Promise.resolve();assert(signal);app.api.setConsent(false);assert.equal(signal.aborted,true);assert.equal(await sending,false);app.api.track('City Selected');await app.api.flush();assert.equal(app.calls.length,1);
});
test('revogação antes do microtask impede envio e preferência de outra aba também desativa',async()=>{
 const app=setup({choice:'1'});const sending=app.api.flush();app.api.setConsent(false);await sending;assert.equal(app.calls.length,0);
 app.api.setConsent(true);app.windows.storage({key:'pluvia-analytics-consent-v1',newValue:'0'});await app.api.flush();assert.equal(app.calls.length,0);assert.equal(app.node('analyticsConsent').checked,false);
});
test('nova visita anônima após reset não conserva identidade da conta',async()=>{
 const app=setup({choice:'1'});await app.api.flush();const id=app.calls[0].body.batch[0].distinct_id;app.api.resetUser();app.api.track('Auth Completed',{mode:'login'});await app.api.flush();assert.notEqual(app.calls[1].body.batch[0].distinct_id,id);
});

function performanceApi(entries,navigation={responseStart:420}) {
  return {
    performance:{getEntriesByType:type=>type==='navigation' ? [navigation] : []},
    PerformanceObserver:class {
      constructor(callback){this.callback=callback;}
      observe({type}){const list=entries[type]||[];if(list.length)this.callback({getEntries:()=>list});}
    }
  };
}
test('Web Vitals saem uma vez por métrica, só com consentimento e sem dados da página',async()=>{
 const entries={
  paint:[{name:'first-paint',startTime:300},{name:'first-contentful-paint',startTime:900}],
  'largest-contentful-paint':[{startTime:1200},{startTime:3100}],
  // Duas janelas de deslocamento: 0,08 e depois 0,07 + 0,05 (a maior janela vale 0,12).
  'layout-shift':[{startTime:100,value:.08,hadRecentInput:false},{startTime:3000,value:.07,hadRecentInput:false},{startTime:3500,value:.05,hadRecentInput:false},{startTime:3600,value:.9,hadRecentInput:true}],
  event:[{interactionId:1,duration:80},{interactionId:1,duration:120},{interactionId:2,duration:640},{interactionId:0,duration:900}]
 };
 const off=setup({performanceApi:performanceApi(entries)});
 off.document.visibilityState='hidden';off.documents.visibilitychange();await off.api.flush();
 assert.equal(off.calls.length,0,'sem participação não há medição enviada');

 const app=setup({choice:'1',performanceApi:performanceApi(entries)});
 app.document.visibilityState='hidden';app.documents.visibilitychange();await app.api.flush();
 const vitals=app.calls.flatMap(call=>call.body.batch).filter(event=>event.event==='Web Vital').map(event=>event.properties);
 const by=Object.fromEntries(vitals.map(v=>[v.metric,v]));
 assert.deepEqual([by.FCP.metric_value,by.FCP.rating],[900,'good']);
 assert.deepEqual([by.LCP.metric_value,by.LCP.rating],[3100,'needs-improvement']);
 assert.deepEqual([by.CLS.metric_value,by.CLS.rating],[120,'needs-improvement']);
 assert.deepEqual([by.INP.metric_value,by.INP.rating],[640,'poor'],'eventos sem interação não contam');
 assert.deepEqual([by.TTFB.metric_value,by.TTFB.rating],[420,'good']);
 for(const v of vitals)assert.deepEqual(Object.keys(v).filter(key=>!['metric','rating','metric_value','app','environment','release','browser','$process_person_profile','$geoip_disable','$ip'].includes(key)),[]);
 app.windows.pagehide();await app.api.flush();
 assert.equal(app.calls.flatMap(call=>call.body.batch).filter(event=>event.event==='Web Vital').length,5,'cada métrica sai uma única vez');
 assert.deepEqual(JSON.parse(JSON.stringify(app.api.sanitize({metric:'LCP',rating:'great',metric_value:120001}))),{metric:'LCP'});
});
test('navegador sem PerformanceObserver continua funcionando',async()=>{
 const app=setup({choice:'1'});app.document.visibilityState='hidden';app.documents.visibilitychange();await app.api.flush();
 assert.equal(app.calls.flatMap(call=>call.body.batch).some(event=>event.event==='Web Vital'),false);
});
test('origem da troca de cidade e dos atalhos da Home usa valores da lista fechada',async()=>{
 const app=setup();app.api.setConsent(true);
 const sources=['swipe','dots','search','favorite','saved_place','brazil','startup','other','location'];
 for(const source of sources)app.api.track('City Selected',{city:'Manaus',uf:'AM',source});
 app.api.track('City Selected',{source:'Manaus'});app.api.track('Compare Opened',{source:'home'});app.api.track('Brazil Now Opened',{source:'home'});
 await app.api.flush();await app.api.flush();
 const batch=app.calls.flatMap(c=>c.body.batch).filter(e=>e.event!=='PLUVIA Opened');
 assert.deepEqual(batch.map(e=>e.properties.source ?? null),[...sources,null,'home','home']);
 assert.doesNotMatch(JSON.stringify(batch),/Manaus|"AM"/);
});

test('release vem da meta do shell e só aceita a geração do SW',async()=>{
 for(const [release,expected] of [['pluvia-panel-153','panel-153'],['<script>alert(1)</script>','unknown'],['pluvia-panel-','unknown'],[undefined,'unknown']]){
  const app=setup({choice:'1',release});
  app.api.track('PLUVIA Opened',{});app.document.visibilityState='hidden';app.documents.visibilitychange();await app.api.flush();
  const sent=app.calls.flatMap(call=>call.body.batch);
  assert.ok(sent.length,String(release));
  for(const event of sent)assert.equal(event.properties.release,expected,String(release));
 }
});
