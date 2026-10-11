const {test}=require('node:test');
const assert=require('node:assert/strict');
const install=require('../dist/modules/install-prompt.js');
const store=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v))};};

test('plataforma: iPhone, iPad com cara de Mac, Android e computador',()=>{
  assert.equal(install.platform({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'}),'ios');
  assert.equal(install.platform({userAgent:'Mozilla/5.0 (Macintosh)',platform:'MacIntel',maxTouchPoints:5}),'ios');
  assert.equal(install.platform({userAgent:'Mozilla/5.0 (Linux; Android 14)'}),'android');
  assert.equal(install.platform({userAgent:'Mozilla/5.0 (Windows NT 10.0)'}),'other');
});

test('só a partir da segunda visita, nunca instalado, computador ou depois de "Agora não"',()=>{
  const storage=store();
  assert.equal(install.shouldOffer({storage,session:store(),now:1e12,os:'ios',installed:false}),false,'primeira visita');
  assert.equal(install.shouldOffer({storage,session:store(),now:1e12,os:'ios',installed:false}),true,'segunda visita');
  const session=store();
  assert.equal(install.shouldOffer({storage,session,now:1e12,os:'android',installed:true}),false,'app instalado');
  assert.equal(install.shouldOffer({storage,session,now:1e12,os:'other',installed:false}),false,'computador');
  storage.setItem('pluvia-install-dismissed',String(1e12));
  assert.equal(install.shouldOffer({storage,session:store(),now:1e12+1000,os:'ios',installed:false}),false,'"Agora não" vale 30 dias');
  assert.equal(install.shouldOffer({storage,session:store(),now:1e12+install.DISMISS_MS+1,os:'ios',installed:false}),true);
  const blocked={getItem(){throw Error('x');},setItem(){throw Error('x');}};
  assert.equal(install.shouldOffer({storage:blocked,session:blocked,now:1,os:'ios',installed:false}),false,'storage bloqueado não insiste');
});

test('passo a passo do iPhone e do Android sem pedido nativo',()=>{
  assert.match(install.steps('ios').join(' '),/Adicionar à Tela de Início/);
  assert.match(install.steps('android',false).join(' '),/Instalar app/);
  assert.deepEqual(install.steps('android',true),[]);
});

test('Android com pedido nativo: botão Instalar chama prompt e some ao aceitar',async()=>{
  const listeners={},els={};
  const el=id=>els[id]||(els[id]={id,hidden:id==='installCard'||id==='alertNudge',textContent:'',open:false,addEventListener(t,f){listeners[id+':'+t]=f;},showModal(){this.open=true;}});
  const win={navigator:{userAgent:'Android 14'},matchMedia:()=>({matches:false}),addEventListener:(t,f)=>{listeners['win:'+t]=f;}};
  const storage=store();storage.setItem('pluvia-install-visits','1');
  const api=install.mount({doc:{getElementById:el},win,storage,session:store(),now:()=>1e12});
  assert.equal(api.offered,true);assert.equal(els.installCard.hidden,false);assert.equal(els.installCardAction.textContent,'Como instalar');
  let prompted=0;listeners['win:beforeinstallprompt']({preventDefault(){},prompt:()=>{prompted++;return Promise.resolve();},userChoice:Promise.resolve({outcome:'accepted'})});
  assert.equal(els.installCardAction.textContent,'Instalar');
  await listeners['installCardAction:click']();
  assert.equal(prompted,1);assert.equal(els.installCard.hidden,true);
});
