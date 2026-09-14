const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs');
const places=require('../dist/saved-places.js');
const entry={id:'local-1',name:'Casa',cityId:'1302603',cityName:'Manaus',uf:'AM'};
test('normaliza locais sem persistir coordenadas ou campos adicionais',()=>{
 assert.deepEqual(places.normalize([{...entry,latitude:-3,longitude:-60,address:'privado'}]),[entry]);
 assert.deepEqual(places.normalize(null),[]);
 assert.deepEqual(places.normalize([{...entry,cityId:'bad'}]),[]);
 assert.deepEqual(places.normalize([{...entry,name:' '}]),[]);
 assert.equal(places.normalize([entry,entry]).length,1);
});
test('cria e renomeia sem mudar a cidade original',()=>{
 const added=places.upsert([],entry), renamed=places.upsert(added,{...entry,name:'Faculdade'});
 assert.equal(renamed.length,1);assert.equal(renamed[0].name,'Faculdade');
 assert.equal(renamed[0].cityId,entry.cityId);assert.equal(added[0].name,'Casa');
});
test('limita a 20 locais e rejeita entradas inválidas',()=>{
 const all=Array.from({length:20},(_,i)=>({...entry,id:'local-'+i}));
 assert.throws(()=>places.upsert(all,{...entry,id:'extra'}),/limit/);
 assert.throws(()=>places.upsert([],{}),/invalid/);
 assert.equal(places.upsert(all,{...entry,name:'Novo'}).length,20);
});
test('gera identificador compatível mesmo sem randomUUID',()=>{
 const id=places.makeId({crypto:{getRandomValues(array){array.fill(7);return array;}}});
 assert.match(id,/^local-[a-f0-9]{32}$/);
 assert.match(places.makeId({}),/^local-[a-z0-9]+-[a-z0-9]+$/);
});
test('integra formulário acessível, cache e escrita segura',()=>{
 const html=fs.readFileSync('dist/index.html','utf8'),sw=fs.readFileSync('dist/sw.js','utf8'),source=fs.readFileSync('dist/saved-places.js','utf8');
 assert.match(html,/id="savedPlacesForm"/);assert.match(html,/for="savedPlaceName"/);
 assert.ok(html.includes('saved-places.js?v=core-59'));assert.ok(sw.includes('saved-places.js?v=core-59'));
 assert.doesNotMatch(source,/innerHTML/);assert.match(source,/owner !== requestedOwner/);
 assert.match(source,/await ensureCityDetails\(item\.cityId\)/);
});
