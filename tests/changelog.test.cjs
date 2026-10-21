const {test}=require('node:test');
const assert=require('node:assert/strict');
const changelog=require('../dist/modules/changelog.js');
const store=(value)=>{const map=new Map(value?[[changelog.SEEN_KEY,value]]:[]);return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),map};};

test('lista: mais nova primeiro, números válidos, sem repetir, datas e itens',()=>{
 const list=changelog.list();
 assert.equal(changelog.current(),list[0].version);
 assert.equal(new Set(list.map(e=>e.version)).size,list.length);
 for(let i=0;i<list.length;i++){
  const e=list[i];
  assert.ok(changelog.parse(e.version),e.version);
  assert.match(e.date,/^\d{4}-\d{2}-\d{2}$/);
  assert.ok(e.items.length>0 && e.items.every(t=>typeof t==='string' && t.length>0));
  if(i>0){assert.equal(changelog.compare(list[i-1].version,e.version),1);assert.ok(list[i-1].date>=e.date);}
 }
});
test('1.1 é novidade, 1.1.1 é correção',()=>{
 assert.equal(changelog.kind('1.1'),'feature');assert.equal(changelog.kind('1.1.1'),'fix');
 assert.equal(changelog.compare('1.10','1.9'),1);assert.equal(changelog.compare('1.1','1.1.0'),0);assert.ok(Number.isNaN(changelog.compare('x','1.0')));
});
test('aviso só para quem já usava e só em versão de novidades',()=>{
 const versions=[{version:'1.2.1',items:['a']},{version:'1.2',title:'Radar novo',items:['b']},{version:'1.1.1',items:['c']},{version:'1.1',items:['d']},{version:'1.0',items:['e']}];
 assert.equal(changelog.pending('1.1',versions).version,'1.2');
 assert.equal(changelog.pending('1.2',versions),null,'só correção depois de 1.2');
 assert.equal(changelog.pending(null,versions),null,'primeiro acesso');
 const first=store();assert.equal(changelog.announce(first),null);assert.equal(first.map.get(changelog.SEEN_KEY),changelog.current());
 const same=store(changelog.current());assert.equal(changelog.announce(same),null);
});

test('janela de novidades: versões depois da última vista, novidades primeiro, no máximo três',()=>{
 const versions=[{version:'1.3'},{version:'1.2.1'},{version:'1.2'},{version:'1.1'},{version:'1.0'}];
 assert.deepEqual(changelog.since('1.1',3,versions).map(e=>e.version),['1.3','1.2','1.2.1']);
 assert.deepEqual(changelog.since('1.2.1',3,versions).map(e=>e.version),['1.3']);
 assert.deepEqual(changelog.since(null,3,versions),[]);
 // Correções depois da novidade não podem empurrar a novidade anunciada para fora da janela.
 const burst=[{version:'1.9.3'},{version:'1.9.2'},{version:'1.9.1'},{version:'1.9'},{version:'1.8'}];
 assert.deepEqual(changelog.since('1.8',3,burst).map(e=>e.version),['1.9','1.9.3','1.9.2']);
 assert.equal(changelog.pending('1.8',burst).version,'1.9');
});

// DOM mínimo para o mount: só o que changelog.js usa.
function fakeDom({introHidden=true,openDialog=false}={}){
 const listeners={},docListeners={};
 const node=(id)=>({id,hidden:false,open:false,textContent:'',dataset:{},children:[],listeners:{},
  addEventListener(t,f){(this.listeners[t]||=[]).push(f);},append(...c){this.children.push(...c);},replaceChildren(...c){this.children=c;},
  querySelector:()=>null,showModal(){this.open=true;this.shown=(this.shown||0)+1;},close(){this.open=false;}});
 const els=Object.fromEntries(['changelogDialog','changelogList','openChangelog','changelogClose','whatsNewDialog','whatsNewList','whatsNewTitle','whatsNewClose','whatsNewOk','whatsNewAll','pluviaIntro'].map(id=>[id,node(id)]));
 els.pluviaIntro.hidden=introHidden;
 const doc={visibilityState:'visible',getElementById:id=>els[id]||null,createElement:()=>node('x'),
  querySelector:sel=>sel==='dialog[open]'&&openDialog?{}:null,
  addEventListener(t,f){(docListeners[t]||=[]).push(f);},removeEventListener(t,f){docListeners[t]=(docListeners[t]||[]).filter(g=>g!==f);}};
 const timers=[];
 const runtime={addEventListener(t,f){(listeners[t]||=[]).push(f);},removeEventListener(t,f){listeners[t]=(listeners[t]||[]).filter(g=>g!==f);},
  setTimeout(f,ms){timers.push({f,ms});return timers.length;},clearTimeout(i){if(timers[i-1])timers[i-1].f=null;}};
 const flush=(max=1000)=>{for(const t of timers.splice(0)) if(t.f && t.ms<=max) t.f();};
 return {els,doc,runtime,timers,flush,docListeners,listeners,setOpen(v){openDialog=v;}};
}
function mountWith(seen,dom,weather=true){
 const code=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','dist','modules','changelog.js'),'utf8');
 const vm=require('node:vm'),storage=store(seen);
 const ctx={globalThis:null,module:undefined,Date,Intl,JSON,Number,String,Array,Object,Map,Set,Boolean,Math};
 Object.assign(dom.runtime,{localStorage:storage,PLUVIA:{},MutationObserver:class{observe(){}disconnect(){}}});
 ctx.globalThis=dom.runtime;ctx.displayedWeather=weather?{}:null;
 vm.runInNewContext(code.replace('typeof globalThis !== "undefined" ? globalThis : this','globalThis'),ctx);
 dom.runtime.PLUVIA.changelog.mount(dom.doc);
 return storage;
}
test('janela de novidades aparece uma vez, depois da intro e da previsão, sem cobrir outra janela',()=>{
 const features=changelog.VERSIONS.filter(e=>changelog.kind(e.version)==='feature').map(e=>e.version);
 const newest=features[0],previous=features[1];
 const dom=fakeDom();const storage=mountWith(previous,dom);
 assert.equal(dom.els.whatsNewDialog.shown,undefined,'espera um respiro antes de abrir');
 dom.flush();
 assert.equal(dom.els.whatsNewDialog.shown,1);
 assert.equal(dom.els.whatsNewTitle.textContent,`O PLUVIA ${newest} chegou`);
 assert.ok(dom.els.whatsNewList.children.length>=1);
 assert.equal(storage.map.get(changelog.SEEN_KEY),changelog.current(),'abrir já marca como vista');
 // Próxima abertura: nada.
 const again=fakeDom();mountWith(changelog.current(),again);again.flush();
 assert.equal(again.els.whatsNewDialog.shown,undefined);
 // Primeiro acesso: nada.
 const first=fakeDom();mountWith(null,first);first.flush();
 assert.equal(first.els.whatsNewDialog.shown,undefined);
 // Intro à mostra ou outra janela aberta: espera.
 const busy=fakeDom({introHidden:false});mountWith(previous,busy);busy.flush();
 assert.equal(busy.els.whatsNewDialog.shown,undefined);
 const covered=fakeDom({openDialog:true});mountWith(previous,covered);covered.flush();
 assert.equal(covered.els.whatsNewDialog.shown,undefined);
 covered.setOpen(false);covered.docListeners.close.forEach(f=>f());covered.flush();
 assert.equal(covered.els.whatsNewDialog.shown,1,'abre quando a outra janela fecha');
});
test('quem abre Novidades antes da janela não recebe a janela depois',()=>{
 const features=changelog.VERSIONS.filter(e=>changelog.kind(e.version)==='feature').map(e=>e.version);
 const dom=fakeDom({openDialog:true});mountWith(features[1],dom);
 dom.els.openChangelog.listeners.click.forEach(f=>f());
 dom.setOpen(false);(dom.docListeners.close||[]).forEach(f=>f());dom.flush();
 assert.equal(dom.els.whatsNewDialog.shown,undefined);
 assert.equal(dom.els.changelogDialog.shown,1);
});
