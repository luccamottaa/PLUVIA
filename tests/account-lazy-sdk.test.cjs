const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// O SDK do Supabase só é baixado na abertura quando pode existir sessão.
function boot({href='https://pluviaweather.com.br/',keys=[],storageFails=false,user=null}={}){
 const nodes=new Map(),scripts=[],changes=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,value:'',textContent:'',disabled:false,events:{},addEventListener(type,fn){this.events[type]=fn;},setAttribute(){},focus(){},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);};
 const auth={onAuthStateChange(){},getSession:async()=>({data:{session:user?{user}:null}})};
 const client={auth,functions:{invoke:async()=>({data:{snapshot:{displayName:'',favoriteCityIds:[],primaryCityId:null,namedPlaces:[]}}})}};
 const storage={getItem:()=>null,setItem(){}};for(const key of keys)storage[key]='{}';
 const url=new URL(href);
 const context={URL,URLSearchParams,Date,AbortController,Intl,setTimeout:()=>0,clearTimeout(){},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
  location:{href,origin:url.origin,pathname:url.pathname,search:url.search,hash:url.hash},history:{state:null,replaceState(){}},
  document:{getElementById:node,createElement:()=>({}),head:{appendChild:script=>{scripts.push(script.src);script.onload();}},addEventListener(){},visibilityState:'visible'},
  PLUVIA:{accountSync:require('../dist/modules/account-sync.js'),socialAuth:require('../dist/modules/social-auth.js')},
  supabase:{createClient:()=>client},addEventListener(){},dispatchEvent:event=>changes.push(event.detail)};
 Object.defineProperty(context,'localStorage',{get(){if(storageFails)throw Error('blocked');return storage;}});
 context.window=context;vm.runInNewContext(fs.readFileSync('dist/account.js','utf8'),context);
 return {node,scripts,changes};
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
