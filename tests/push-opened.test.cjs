// Registro de abertura das notificações (novembro/2026: 12 aberturas em ~1.200 avisos aceitos).
// 1. Janela já aberta sem WindowClient.navigate (Safari) ou com navigate falhando: o service worker manda o
//    endereço para a página, que registra a abertura.
// 2. Sem sessão de conta salva, account.js avisa "sem conta" antes de notifications.js carregar: o registro
//    precisa rodar também na inicialização de notifications.js.
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

function clickHandler(){
  const listeners={};
  const self={addEventListener:(type,fn)=>{listeners[type]=fn;},location:{href:'https://pluviaweather.com.br/sw.js',origin:'https://pluviaweather.com.br'},registration:{scope:'https://pluviaweather.com.br/'},navigator:{},clients:null};
  vm.runInNewContext(fs.readFileSync('dist/sw.js','utf8'),{self,importScripts(){},URL,Request:function(){},Response:function(){},caches:{},fetch(){},console,setTimeout,clearTimeout});
  return {self,click:listeners.notificationclick};
}
async function run(client){
  const {self,click}=clickHandler();
  self.clients={matchAll:async()=>[client],openWindow:async()=>null};
  let done;
  click({notification:{close(){},data:{url:'./?push_delivery=11111111-2222-3333-4444-555555555555#alertas'}},waitUntil:promise=>{done=promise;}});
  await done;
}

test('sem navigate, a janela aberta recebe o endereço com o id da entrega',async()=>{
  const messages=[];let focused=false;
  await run({url:'https://pluviaweather.com.br/',postMessage:m=>messages.push(m),focus(){focused=true;}});
  assert.equal(messages.length,1);
  assert.equal(messages[0].type,'push-opened');
  assert.match(messages[0].url,/push_delivery=11111111-2222-3333-4444-555555555555#alertas$/);
  assert.ok(focused);
});

test('navigate que falha também manda o endereço; navigate que funciona não manda',async()=>{
  const failed=[];
  await run({url:'https://pluviaweather.com.br/',navigate:()=>Promise.reject(new Error('x')),postMessage:m=>failed.push(m),focus(){}});
  assert.equal(failed.length,1);
  const ok=[];
  await run({url:'https://pluviaweather.com.br/',navigate:()=>Promise.resolve(null),postMessage:m=>ok.push(m),focus(){}});
  assert.equal(ok.length,0);
});

test('notifications.js registra a abertura na inicialização e pelo aviso do service worker',()=>{
  const code=fs.readFileSync('dist/notifications.js','utf8');
  const tail=code.slice(code.lastIndexOf('window.pluviaPush'));
  assert.match(tail,/\n\s*reportOpened\(\);\n\}\)\(\);\s*$/);
  assert.match(code,/type === "push-opened"\) \{[\s\S]{0,80}reportOpened\(from\)/);
});

test('o próprio service worker registra a abertura no toque, só com o id da entrega',async()=>{
  const listeners={},calls=[];
  const self={addEventListener:(type,fn)=>{listeners[type]=fn;},location:{href:'https://pluviaweather.com.br/sw.js',origin:'https://pluviaweather.com.br'},registration:{scope:'https://pluviaweather.com.br/'},navigator:{},clients:{matchAll:async()=>[],openWindow:async()=>null}};
  vm.runInNewContext(fs.readFileSync('dist/sw.js','utf8'),{self,importScripts(){},URL,Request:function(){},Response:function(){},caches:{},fetch:async(url,init)=>{calls.push({url,init});return {ok:true};},AbortSignal,console,setTimeout,clearTimeout});
  const waits=[];
  const click=data=>listeners.notificationclick({notification:{close(){},data},waitUntil:p=>waits.push(p)});
  click({url:'./?push_delivery=11111111-2222-3333-4444-555555555555',deliveryId:'11111111-2222-3333-4444-555555555555'});
  await Promise.all(waits);
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/\/rest\/v1\/rpc\/pluvia_push_opened$/);
  assert.deepEqual(JSON.parse(calls[0].init.body),{p_delivery:'11111111-2222-3333-4444-555555555555'});
  assert.equal(calls[0].init.keepalive,true);
  click({url:'./',deliveryId:'<script>'});click({url:'./'});
  await Promise.all(waits);
  assert.equal(calls.length,1,'sem id válido não chama nada');
  const sql=fs.readFileSync('supabase/migrations/20261113140000_push_opened_public.sql','utf8');
  assert.match(sql,/opened_at is null/);assert.match(sql,/set search_path = ''/);assert.match(sql,/grant execute on function public\.pluvia_push_opened\(uuid\) to anon, authenticated;/);
});
