const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const social=require('../dist/modules/social-auth.js');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('descoberta deduplica, usa chave publicável e revalida após freshness',async()=>{
 let calls=0,now=0;
 const discovery=social.createDiscovery({async getJson(url,options){calls++;assert.equal(url,'https://dszyyrcvwrpyiypwyvxe.supabase.co/auth/v1/settings');assert.match(options.headers.apikey,/^sb_publishable_/);assert.equal(options.timeoutMs,6000);return {external:{google:true,apple:false}};}},{now:()=>now});
 const [a,b]=await Promise.all([discovery.load(),discovery.load()]);assert.equal(a,b);assert.deepEqual(a,{google:true,apple:false});assert.equal(calls,1);
 await discovery.load();assert.equal(calls,1);now=300001;await discovery.load();assert.equal(calls,2);
});
test('falha ou resposta inválida não expõe opção quebrada nem habilita por truthiness',async()=>{
 for(const raw of [null,{external:{google:'true',apple:false}}]){
  assert.deepEqual(await social.createDiscovery({getJson:async()=>raw}).load(),{google:false,apple:false});
 }
 let now=0,calls=0;const discovery=social.createDiscovery({getJson:async()=>{calls++;throw Error('timeout');}},{now:()=>now});
 await discovery.load();await discovery.load();assert.equal(calls,1);now=10001;await discovery.load();assert.equal(calls,2);
});
test('retorno público não herda preview protegido, caminho, query ou tokens',()=>{
 assert.equal(social.redirectTo({origin:'https://pluviaweather.com.br',pathname:'/'}),'https://pluviaweather.com.br/?auth_return=1');
 for(const origin of ['https://pluvia-lucca-49c6.vercel.app','https://www.pluviaweather.com.br','https://luccamottaa.github.io']){
  const location={origin,pathname:'/index.html',search:'?redirect_to=https://hostile.example/',hash:'#access_token=fixture'};
  assert.equal(social.redirectTo(location),'https://pluviaweather.com.br/?auth_return=1');
  assert.equal(social.redirectTo(location,'confirmation'),'https://pluviaweather.com.br/');
  assert.equal(social.redirectTo(location,'recovery'),'https://pluviaweather.com.br/?auth_recovery=1');
 }
 assert.equal(social.redirectTo({origin:'http://localhost:4173',pathname:'/'}),'http://localhost:4173/?auth_return=1');
 assert.equal(social.redirectTo({origin:'http://127.0.0.1:4173',pathname:'/index.html'},'confirmation'),'http://127.0.0.1:4173/index.html');
 assert.equal(social.redirectTo({origin:'http://127.0.0.1:4173',pathname:'/'},'recovery'),'http://127.0.0.1:4173/?auth_recovery=1');
 assert.throws(()=>social.redirectTo({origin:'http://hostile.example',pathname:'/'}));
 assert.throws(()=>social.redirectTo({origin:'https://localhost.example',pathname:'/'},'invalid'));
 assert.throws(()=>social.redirectTo({origin:'https://user:password@example.test',pathname:'/'}));
 assert.throws(()=>social.authorizeUrl('https://hostile.example/auth/v1/authorize?provider=google','google'));
 assert.throws(()=>social.authorizeUrl('https://dszyyrcvwrpyiypwyvxe.supabase.co/auth/v1/authorize?provider=apple','google'));
 assert.throws(()=>social.authorizeUrl('https://dszyyrcvwrpyiypwyvxe.supabase.co/auth/v1/authorize?provider=github','github'));
});
test('OAuth iniciado no preview volta ao Pluvia público',async()=>{
 const app=boot({href:'https://pluvia-lucca-49c6.vercel.app/index.html?other=1#agora'});await settle();
 app.node('accountButton').events.click();await settle();await app.node('accountGoogle').events.click();
 assert.equal(app.calls[0].options.redirectTo,'https://pluviaweather.com.br/?auth_return=1');
});
test('cada provider é confirmado independentemente e resposta parcial revalida cedo',async()=>{
 let now=0,calls=0;
 const discovery=social.createDiscovery({getJson:async()=>{calls++;return calls===1 ? {external:{google:true}} : {external:{google:1,apple:true}};}},{now:()=>now});
 assert.deepEqual(await discovery.load(),{google:true,apple:false});assert.equal(calls,1);
 now=10001;assert.deepEqual(await discovery.load(),{google:false,apple:true});assert.equal(calls,2);
});
test('callback reconhece cancelamento e remove dados transitórios sem tocar em navegação comum',()=>{
 const denied='https://pluviaweather.com.br/?auth_return=1&error_description=%3Cscript%3E#'+'error=access_denied&access_token=secret';
 assert.deepEqual(social.callback(denied),{returned:true,error:'cancelled'});
 assert.equal(social.cleanCallback(denied),'https://pluviaweather.com.br/');
 assert.equal(social.cleanCallback('https://pluviaweather.com.br/?other=1#agora'),'https://pluviaweather.com.br/?other=1#agora');
 assert.deepEqual(social.callback('https://pluviaweather.com.br/#agora'),{returned:false,error:null});
});
function boot({providers={google:true,apple:true},user=null,href='https://pluviaweather.com.br/',oauthError=null,target,fetchFails=false}={}){
 const nodes=new Map(),events=new Map(),timers=new Map(),calls=[],assigned=[],historyCalls=[];
 let serial=0,clientOptions;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,value:'',textContent:'',disabled:false,events:{},addEventListener(type,fn){this.events[type]=fn;},setAttribute(){},focus(){this.focused=true;},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);};
 const auth={onAuthStateChange(){},getSession:async()=>({data:{session:user?{user}:null}}),signInWithOAuth:async args=>{calls.push(args);return oauthError ? {error:oauthError} : {data:{url:target || 'https://dszyyrcvwrpyiypwyvxe.supabase.co/auth/v1/authorize?provider='+args.provider}};}};
 const client={auth,functions:{invoke:async()=>({data:{snapshot:{displayName:'',favoriteCityIds:[],primaryCityId:null,namedPlaces:[]}}})}};
 const url=new URL(href);
 const context={URL,URLSearchParams,Date,AbortController,Intl,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
  location:{href,origin:url.origin,pathname:url.pathname,assign:value=>assigned.push(value)},
  history:{state:null,replaceState:(_,title,url)=>historyCalls.push(url)},
  document:{getElementById:node,createElement:()=>({}),head:{appendChild:script=>script.onload()},addEventListener(){},visibilityState:'visible'},
  localStorage:{getItem:()=>null,setItem(){}},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
  PLUVIA:{accountSync:require('../dist/modules/account-sync.js'),socialAuth:social,http:{createClient:()=>({getJson:async()=>{if(fetchFails)throw Error('timeout');return {external:providers};}})}},
  supabase:{createClient(url,key,options){clientOptions=options;return client;}},addEventListener:(type,fn)=>events.set(type,fn),dispatchEvent(){}};
 context.window=context;vm.runInNewContext(fs.readFileSync('dist/account.js','utf8'),context);
 return {node,calls,assigned,events,timers,historyCalls,clientOptions:()=>clientOptions};
}
test('Google e Apple habilitados iniciam mesmo fluxo de conta sem formulário ou segredo',async()=>{
 for(const provider of ['google','apple']){
 const app=boot();await settle();app.node('accountButton').events.click();await settle();
 assert.equal(app.node('accountSocial').hidden,false);
 await app.node(provider==='google'?'accountGoogle':'accountApple').events.click();
 assert.equal(app.calls[0].provider,provider);assert.equal(app.calls[0].options.skipBrowserRedirect,true);assert.equal(app.calls[0].options.redirectTo,'https://pluviaweather.com.br/?auth_return=1');
 assert.equal(app.assigned.length,1);assert.equal(app.node('accountSubmit').disabled,true);
 await app.node('accountGoogle').events.click();assert.equal(app.calls.length,1);
 app.events.get('pageshow')();assert.equal(app.node('accountSubmit').disabled,false);
 assert.equal(app.clientOptions().auth.detectSessionInUrl,true);assert.equal(app.clientOptions().auth.flowType,undefined);
 }
});
test('provedores desativados ou descoberta indisponível preservam login por e-mail',async()=>{
 for(const options of [{providers:{google:false,apple:false}},{fetchFails:true}]){
 const app=boot(options);await settle();app.node('accountButton').events.click();await settle();assert.equal(app.node('accountSocial').hidden,true);assert.equal(app.node('accountForm').hidden,false);await app.node('accountGoogle').events.click();assert.equal(app.calls.length,0);
 }
 const one=boot({providers:{google:true,apple:false}});await settle();one.node('accountButton').events.click();await settle();assert.equal(one.node('accountGoogle').hidden,false);assert.equal(one.node('accountApple').hidden,true);
});
test('erro do provedor ou destino inválido libera botões e não expõe mensagem bruta',async()=>{
 for(const options of [{oauthError:{code:'provider_disabled',message:'secret raw response'}},{target:'https://hostile.example/'}]){
 const app=boot(options);await settle();app.node('accountButton').events.click();await settle();await app.node('accountGoogle').events.click();assert.equal(app.assigned.length,0);assert.equal(app.node('accountSubmit').disabled,false);assert.doesNotMatch(app.node('accountStatus').textContent,/secret|hostile/);
 }
});
test('callback cancelado não autentica e apresenta mensagem segura, limpando URL',async()=>{
 const app=boot({href:'https://pluviaweather.com.br/?auth_return=1#error=access_denied&error_description=%3Cimg%3E'});await settle();assert.equal(app.node('accountDialog').open,true);assert.match(app.node('accountStatus').textContent,/cancelou/);assert.doesNotMatch(app.node('accountStatus').textContent,/img/);assert.equal(app.historyCalls[0],'https://pluviaweather.com.br/');assert.equal(app.node('accountProfile').hidden,true);
});
test('Apple sem nome usa formulário existente; Google reaproveita full_name sem inventar nome',async()=>{
 const apple=boot({href:'https://pluviaweather.com.br/?auth_return=1',user:{id:'apple',email:'relay@example.test',user_metadata:{}}});await settle();assert.equal(apple.node('accountDialog').open,true);assert.equal(apple.node('profileName').focused,true);assert.equal(apple.node('profileName').value,'');assert.equal(apple.node('accountProfile').hidden,false);
 const google=boot({href:'https://pluviaweather.com.br/?auth_return=1',user:{id:'google',email:'user@example.test',user_metadata:{full_name:'Maria Silva'}}});await settle();assert.equal(google.node('accountButton').textContent,'Olá, Maria');assert.equal(google.node('accountDialog').open,undefined);assert.equal(google.node('accountSocial').hidden,true);
});

test('mensagens de notificações não apagam cancelamento ou erro de autenticação',()=>{
 const source=fs.readFileSync('dist/notifications.js','utf8');
 const supportNote={textContent:''},accountStatus={textContent:'Você cancelou o acesso.'};
 const context={supportNote,el:()=>accountStatus};
 vm.runInNewContext(source.slice(source.indexOf('  function message(value)'),source.indexOf('  function status(kind')),context);
 context.message('Permissão ainda não solicitada.');
 assert.equal(accountStatus.textContent,'Você cancelou o acesso.');
 assert.equal(supportNote.textContent,'Permissão ainda não solicitada.');
});
