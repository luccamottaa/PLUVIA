const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
// "Agora não" do convite de avisos vale 30 dias neste aparelho (antes era para sempre).
const source=fs.readFileSync(path.join(__dirname,'..','dist','notifications.js'),'utf8');
const block=source.slice(source.indexOf('  const DISMISS_KEY'),source.indexOf('  // Marca que a inscrição deste aparelho'));
function load(initial){
 const data=new Map(initial===undefined?[]:[['pluvia-notification-prompt-dismissed',initial]]);
 const localStorage={getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const api=vm.runInNewContext(`${block}\n({promptDismissed})`,{localStorage,Number});
 return {api,data};
}
test('sem recusa, o convite pode aparecer',()=>{assert.equal(load().api.promptDismissed(1e12),false);});
test('recusa vale 30 dias e depois some do storage',()=>{
 const now=Date.UTC(2026,9,12);
 const recent=load(String(now-29*864e5));assert.equal(recent.api.promptDismissed(now),true);
 const old=load(String(now-31*864e5));assert.equal(old.api.promptDismissed(now),false);assert.equal(old.data.has('pluvia-notification-prompt-dismissed'),false);
 const future=load(String(now+864e5));assert.equal(future.api.promptDismissed(now),false,'relógio que voltou no tempo não esconde para sempre');
});
test('o antigo "1" conta como recusa a partir de agora',()=>{
 const now=Date.UTC(2026,9,12);const legacy=load('1');
 assert.equal(legacy.api.promptDismissed(now),true);assert.equal(legacy.data.get('pluvia-notification-prompt-dismissed'),String(now));
 assert.equal(legacy.api.promptDismissed(now+31*864e5),false);
});
test('lixo no storage não esconde o convite',()=>{assert.equal(load('abc').api.promptDismissed(1e12),false);});
