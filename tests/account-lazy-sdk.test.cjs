const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// O SDK do Supabase só é baixado na abertura quando pode existir sessão.
function boot({href='https://pluviaweather.com.br/',keys=[],storageFails=false,user=null,tokens={},anonymous=null}={}){
 const nodes=new Map(),scripts=[],changes=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,value:'',textContent:'',disabled:false,events:{},addEventListener(type,fn){this.events[type]=fn;},setAttribute(){},focus(){},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);};
 const anonCalls=[];
 const auth={onAuthStateChange(){},getSession:async()=>({data:{session:user?{user}:null}}),signInAnonymously:async()=>{anonCalls.push(1);return anonymous ? {data:{user:anonymous},error:null} : {data:{user:null},error:{message:'Anonymous sign-ins are disabled'}};}};
 const client={auth,functions:{invoke:async()=>({data:{snapshot:{displayName:'',favoriteCityIds:[],primaryCityId:null,namedPlaces:[]}}})}};
 const storage={getItem:key=>tokens[key] ?? null,setItem(){}};for(const key of Object.keys(tokens))storage[key]=tokens[key];for(const key of keys)storage[key]='{}';
 const url=new URL(href);
 const context={URL,URLSearchParams,Date,AbortController,Intl,setTimeout:()=>0,clearTimeout(){},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
  location:{href,origin:url.origin,pathname:url.pathname,search:url.search,hash:url.hash},history:{state:null,replaceState(){}},
  document:{getElementById:node,createElement:()=>({}),head:{appendChild:script=>{scripts.push(script.src);script.onload();}},addEventListener(){},visibilityState:'visible'},
  PLUVIA:{accountSync:require('../dist/modules/account-sync.js'),socialAuth:require('../dist/modules/social-auth.js')},
  supabase:{createClient:()=>client},addEventListener(){},dispatchEvent:event=>changes.push(event.detail)};
 Object.defineProperty(context,'localStorage',{get(){if(storageFails)throw Error('blocked');return storage;}});
 context.window=context;vm.runInNewContext(fs.readFileSync('dist/account.js','utf8'),context);
 return {node,scripts,changes,anonCalls,account:context.pluviaAccount};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('sem sessão salva nem retorno na URL, a abertura não baixa o SDK e mostra a conta deslogada',async()=>{
 const app=boot({keys:['pluvia-city','pluvia-favorites']});await settle();
 assert.deepEqual(app.scripts,[]);assert.equal(app.node('accountButton').textContent,'Entrar / cadastrar');
 assert.equal(app.changes.at(-1)?.user,null,'avisa os consumidores que não há conta');
 app.node('accountButton').events.click();await settle();
 assert.deepEqual(app.scripts,['/vendor/supabase-2.116.0.js'],'abrir a conta carrega o SDK');
});
test('sessão salva, retorno OAuth/confirmação/recuperação ou storage bloqueado restauram na abertura',async()=>{
 const cases=[{keys:['sb-dszyyrcvwrpyiypwyvxe-auth-token']},{href:'https://pluviaweather.com.br/?auth_return=1&code=abc'},
  {href:'https://pluviaweather.com.br/#access_token=x&type=signup'},{href:'https://pluviaweather.com.br/?auth_recovery=1'},
  {href:'https://pluviaweather.com.br/?error=access_denied'},{storageFails:true}];
 for(const options of cases){const app=boot(options);await settle();assert.equal(app.scripts.length,1,JSON.stringify(options));}
 const app=boot({keys:['sb-dszyyrcvwrpyiypwyvxe-auth-token'],user:{id:'u1',email:'a@b.c',user_metadata:{name:'Ana'}}});await settle();await settle();
 assert.equal(app.node('accountButton').textContent,'Olá, Ana');
});
test('chaves parecidas não disparam o SDK',async()=>{
 const app=boot({keys:['sb-x-auth-token-code-verifier-old','pluvia-sb-auth-token'],href:'https://pluviaweather.com.br/clima/manaus-am/?ref=code'});await settle();
 assert.deepEqual(app.scripts,[]);
});

const ANON={id:'anon-1',is_anonymous:true,user_metadata:{}};
test('sessão só anônima (avisos sem conta) não baixa o SDK na abertura nem conta como conta',async()=>{
 const app=boot({tokens:{'sb-dszyyrcvwrpyiypwyvxe-auth-token':JSON.stringify({user:ANON})}});await settle();
 assert.deepEqual(app.scripts,[]);assert.equal(app.node('accountButton').textContent,'Entrar / cadastrar');
 const real=boot({tokens:{'sb-dszyyrcvwrpyiypwyvxe-auth-token':JSON.stringify({user:{id:'u1',is_anonymous:false}})}});await settle();
 assert.equal(real.scripts.length,1,'sessão de conta continua restaurando');
});
test('ativar avisos sem conta cria sessão anônima, mas a interface segue deslogada',async()=>{
 const app=boot({anonymous:ANON});await settle();
 assert.equal(await app.account.ensurePushUser({create:false}),null,'sem criar: não abre sessão nova');
 assert.equal(app.anonCalls.length,0);
 const user=await app.account.ensurePushUser();
 assert.equal(user.id,'anon-1');assert.equal(app.anonCalls.length,1);
 assert.equal(app.account.getUser(),null,'conta continua vazia');assert.equal(app.account.getPushUser().id,'anon-1');
 assert.equal(app.node('accountButton').textContent,'Entrar / cadastrar');
 const last=app.changes.at(-1);assert.equal(last.user,null);assert.equal(last.pushUser.id,'anon-1');
 await app.account.ensurePushUser();assert.equal(app.anonCalls.length,1,'reaproveita a sessão');
});
test('com conta, os avisos usam a própria conta; login anônimo desligado devolve erro',async()=>{
 const real={id:'u1',email:'a@b.c',user_metadata:{name:'Ana'}};
 const app=boot({keys:['sb-dszyyrcvwrpyiypwyvxe-auth-token'],user:real});await settle();await settle();
 assert.equal((await app.account.ensurePushUser()).id,'u1');assert.equal(app.anonCalls.length,0);
 const off=boot({});await settle();
 await assert.rejects(off.account.ensurePushUser());assert.equal(off.account.getPushUser(),null);
});
