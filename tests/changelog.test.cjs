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
