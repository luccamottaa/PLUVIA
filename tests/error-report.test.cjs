const {test}=require('node:test'),assert=require('node:assert/strict');
const {safeCode,parseDsn,buildEnvelope,reportError,resetReportsForTest}=require('../supabase/functions/_shared/error-report.js');
const DSN='https://35e976aef224e8a797d7f567791c407b@o4512235023040512.ingest.us.sentry.io/4512235052204032';

test('aceita só DSN https do ingest do Sentry',()=>{
 assert.deepEqual(parseDsn(DSN),{key:'35e976aef224e8a797d7f567791c407b',endpoint:'https://o4512235023040512.ingest.us.sentry.io/api/4512235052204032/envelope/',dsn:DSN});
 for(const bad of [undefined,'',DSN.replace('https','http'),DSN.replace('sentry.io','sentry.io.evil.test'),DSN.replace('.io/','.io:444/'),'https://abc@o1.ingest.sentry.io/1','https://35e976aef224e8a797d7f567791c407b:pw@o1.ingest.sentry.io/1',DSN+'/x']) assert.equal(parseDsn(bad),null,String(bad));
});

test('código vira slug fixo; mensagem bruta nunca sai',()=>{
 assert.equal(safeCode('worker_accounts_failed'),'worker_accounts_failed');
 assert.equal(safeCode('TimeoutError'),'timeouterror');
 for(const raw of ['duplicate key value violates unique constraint "x"','user@mail.com','https://fcm.googleapis.com/x',null,'','1abc']) assert.equal(safeCode(raw),'unexpected');
});

test('envelope leva componente, código e contagem, sem dados pessoais',()=>{
 const target=parseDsn(DSN);
 const lines=buildEnvelope(target,{component:'push-process',code:'Erro com lukamotta06@gmail.com',level:'warning',count:3.4,now:new Date('2026-10-11T12:00:00Z'),eventId:'a'.repeat(32)}).split('\n');
 assert.equal(lines.length,3);
 const event=JSON.parse(lines[2]);
 assert.deepEqual(event.tags,{component:'push-process',code:'unexpected'});
 assert.equal(event.level,'warning');
 assert.deepEqual(event.extra,{count:3});
 assert.equal(event.timestamp,Date.parse('2026-10-11T12:00:00Z')/1000);
 for(const key of ['user','request','exception','contexts','server_name','breadcrumbs']) assert.equal(key in event,false,key);
 assert.doesNotMatch(lines.join('\n'),/gmail|@mail/);
 const ok=JSON.parse(buildEnvelope(target,{component:'push-send',code:'test_failed',eventId:'b'.repeat(32)}).split('\n')[2]);
 assert.deepEqual(ok.fingerprint,['push-send','test_failed']);
 assert.equal('extra' in ok,false);
});

test('envia uma vez, deduplica por 5 min e nunca lança',async()=>{
 resetReportsForTest();
 const calls=[];
 const fetchImpl=async(url,init)=>{calls.push({url,init});return new Response(null,{status:200});};
 assert.equal(await reportError('push-send','test_failed',{dsn:DSN,fetchImpl,now:1_000}),true);
 assert.equal(calls[0].url,'https://o4512235023040512.ingest.us.sentry.io/api/4512235052204032/envelope/');
 assert.match(calls[0].init.headers['X-Sentry-Auth'],/sentry_key=35e976aef224e8a797d7f567791c407b/);
 assert.equal(await reportError('push-send','test_failed',{dsn:DSN,fetchImpl,now:60_000}),false);
 assert.equal(calls.length,1);
 assert.equal(await reportError('push-send','test_failed',{dsn:DSN,fetchImpl,now:1_000+5*60_000}),true);
 assert.equal(await reportError('push-send','other',{dsn:DSN,fetchImpl:async()=>{throw new Error('offline');},now:1_000}),false);
 assert.equal(await reportError('push-send','x',{dsn:undefined,fetchImpl}),false);
 assert.equal(calls.length,2);
});
