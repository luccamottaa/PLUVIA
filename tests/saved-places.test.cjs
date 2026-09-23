const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs');
const places=require('../dist/saved-places.js');
const entry={id:'local-1',name:'Casa',cityId:'1302603',cityName:'Manaus',uf:'AM',updatedAt:100};
test('normaliza locais sem persistir coordenadas ou campos adicionais',()=>{
 assert.deepEqual(places.normalize([{...entry,latitude:-3,longitude:-60,address:'privado'}]),[entry]);
 assert.deepEqual(places.normalize(null),[]);
 assert.deepEqual(places.normalize([{...entry,cityId:'bad'}]),[]);
 assert.deepEqual(places.normalize([{...entry,name:' '}]),[]);
 assert.equal(places.normalize([entry,entry]).length,1);
});
test('cria e renomeia sem mudar a cidade original',()=>{
 const added=places.upsert([],entry,100), renamed=places.upsert(added,{...entry,name:'Faculdade'},200);
 assert.equal(places.visible(renamed).length,1);assert.equal(places.visible(renamed)[0].name,'Faculdade');
 assert.equal(places.visible(renamed)[0].cityId,entry.cityId);assert.equal(added[0].name,'Casa');
});
test('limita a 20 locais e rejeita entradas inválidas',()=>{
 const all=Array.from({length:20},(_,i)=>({...entry,id:'local-'+i,updatedAt:i+1}));
 assert.throws(()=>places.upsert(all,{...entry,id:'extra'},99),/limit/);
 assert.throws(()=>places.upsert([],{}),/invalid/);
 assert.equal(places.visible(places.upsert(all,{...entry,name:'Novo'},50)).length,20);
});
test('une dois aparelhos pelo updatedAt e preserva remoção recente',()=>{
 const a=[{id:'local-1',name:'Casa',cityId:'1302603',cityName:'Manaus',uf:'AM',updatedAt:10}];
 const b=[{id:'local-1',name:'Lar',cityId:'1302603',cityName:'Manaus',uf:'AM',updatedAt:20},{id:'local-2',name:'Faculdade',cityId:'1302603',cityName:'Manaus',uf:'AM',updatedAt:15}];
 const merged=places.merge(a,b);
 assert.equal(places.visible(merged).find(item=>item.id==='local-1').name,'Lar');
 assert.equal(places.visible(merged).length,2);
 const removed=places.remove(b,'local-2',30);
 const after=places.merge(a,removed);
 assert.equal(places.visible(after).some(item=>item.id==='local-2'),false);
 assert.equal(places.visible(after).find(item=>item.id==='local-1').name,'Lar');
});
test('gera identificador compatível mesmo sem randomUUID',()=>{
 const id=places.makeId({crypto:{getRandomValues(array){array.fill(7);return array;}}});
 assert.match(id,/^local-[a-f0-9]{32}$/);
 assert.match(places.makeId({}),/^local-[a-z0-9]+-[a-z0-9]+$/);
});
test('integra formulário acessível, cache e escrita segura',()=>{
 const html=fs.readFileSync('dist/index.html','utf8'),sw=fs.readFileSync('dist/sw.js','utf8'),source=fs.readFileSync('dist/saved-places.js','utf8');
 assert.match(html,/id="savedPlacesForm"/);assert.match(html,/for="savedPlaceName"/);
 assert.ok(html.includes('saved-places.js?v=core-81'));assert.ok(sw.includes('saved-places.js?v=core-81'));
 assert.doesNotMatch(source,/innerHTML/);assert.match(source,/owner !== requestedOwner/);
 assert.match(source,/await ensureCityDetails\(item\.cityId\)/);
 assert.match(source,/client\.auth\.getUser/);
});
