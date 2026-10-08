const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','dist','index.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','dist','sky.css'),'utf8');
const source=html.match(/<script>\s*\/\* Modo seguro[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,'');
function boot(store,{search='',now=Date.parse('2026-10-08T05:00:00Z')}={}){
  const attrs={},listeners={},docListeners={};
  const ctx={localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}},
    location:{search},Date:{now:()=>now},Number,String,
    document:{hidden:false,documentElement:{setAttribute:(k,v)=>{attrs[k]=v;}},addEventListener:(t,f)=>{docListeners[t]=f;}},
    addEventListener:(t,f)=>{listeners[t]=f;}};
  vm.runInNewContext(source,ctx);
  return {safe:'data-safe' in attrs,listeners,docListeners,ctx};
}
test('abertura normal não entra em modo seguro e fechar limpa o marcador',()=>{
  const store={};const page=boot(store);
  assert.equal(page.safe,false);
  assert.equal(store['pluvia-boot-pending'],'1');
  page.listeners.pagehide();
  assert.equal(store['pluvia-boot-pending'],undefined);
  assert.equal(boot(store).safe,false,'quem fechou o app normalmente abre o céu completo');
});
test('queda (sem pagehide) faz a próxima abertura usar o modo seguro por 24 h',()=>{
  const store={};boot(store);
  const now=Date.parse('2026-10-08T05:00:00Z');
  assert.equal(boot(store,{now}).safe,true);
  assert.equal(Number(store['pluvia-safe-until']),now+864e5);
  const later=boot(store,{now:now+3600e3});later.listeners.pagehide();
  const again=boot(store,{now:now+2*3600e3});
  assert.equal(again.safe,true,'continua no modo seguro dentro das 24 h');
  again.listeners.pagehide();
  const next=boot(store,{now:now+26*3600e3});
  assert.equal(next.safe,false,'depois de 24 h tenta o céu completo de novo');
});
test('segundo plano limpa o marcador e a volta o recoloca; ?seguro=1 força o modo',()=>{
  const store={};const page=boot(store);
  page.ctx.document.hidden=true;page.docListeners.visibilitychange();
  assert.equal(store['pluvia-boot-pending'],undefined);
  page.ctx.document.hidden=false;page.docListeners.visibilitychange();
  assert.equal(store['pluvia-boot-pending'],'1');
  assert.equal(boot({},{search:'?seguro=1'}).safe,true);
});
test('modo seguro mantém o céu, parado: sem animação nem camada 3D, só os raios saem',()=>{
  assert.match(css,/:root\[data-safe\] :is\(\.sky-clouds,\.sky-rain\), :root\[data-safe\] \.sky-stars::after \{ animation:none !important; \}/);
  assert.match(css,/:root\[data-safe\] \.sky-clouds \{ transform:translate\(/);
  assert.doesNotMatch(css,/:root\[data-safe\][^{]*sky-clouds[^{]*\{[^}]*display:none/,'as nuvens continuam visíveis');
  assert.match(css,/:root\[data-safe\] \.sky-lightning \{ display:none !important; \}/);
});
