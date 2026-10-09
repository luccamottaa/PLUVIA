const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..','dist',file),'utf8');
const html=read('index.html');
// O modo seguro (céu parado por 24 h depois de uma queda) saiu a pedido do usuário: as animações
// valem sempre, só reduced-motion as desliga.
test('não há mais modo seguro: nenhum data-safe, aviso ou marcador de abertura',()=>{
  for(const file of ['index.html','app.js','p0.js','sky.css','continuous.css','modules/dialog-motion.js','modules/share-weather.js']){
    const source=read(file);
    assert.doesNotMatch(source,/data-safe|safeModeNote|seguro=|pluvia-safe-until"\)\)|setItem\("pluvia-boot-pending"/,file);
  }
});
test('a abertura limpa as marcas que o modo seguro deixou no aparelho',()=>{
  const source=html.match(/<script>\s*\/\* O antigo modo seguro[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,'');
  const store={'pluvia-boot-pending':'1','pluvia-safe-until':'9999999999999','pluvia-intro-at':'1'};
  const attrs={};
  vm.runInNewContext(source,{localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v);},removeItem:k=>{delete store[k];}},
    document:{documentElement:{setAttribute:(k,v)=>{attrs[k]=v;}}}});
  assert.deepEqual(store,{'pluvia-intro-at':'1'},'só as chaves do modo seguro saem');
  assert.deepEqual(attrs,{});
  assert.doesNotThrow(()=>vm.runInNewContext(source,{localStorage:{removeItem:()=>{throw new Error('blocked');}}}),'storage bloqueado não quebra a abertura');
});
