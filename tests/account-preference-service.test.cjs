const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {snapshot,operationsInput,applyOperations}=require('../supabase/functions/_shared/account-preferences.js');
const place={id:'place-1',name:'Casa',cityId:'1302603',cityName:'Manaus',uf:'AM',updatedAt:100};
const operation=(id,expectedUpdatedAt,name)=>({id,expectedUpdatedAt,deleted:false,place:{name,cityId:'1302603',cityName:'Manaus',uf:'AM'}});
test('normaliza legado e remove campos privados/adicionais sem alterar perfil',()=>{
  const value=snapshot({name:'Nome',favorite_city_ids:['1302603',1302603,'bad'],primary_city_id:3550308,named_places_v1:[{...place,latitude:-3,address:'endereço'}]});
  assert.deepEqual(value.favoriteCityIds,['1302603']);assert.equal(value.primaryCityId,'3550308');assert.deepEqual(value.namedPlaces,[place]);
  assert.deepEqual(applyOperations({name:'Nome'},operationsInput({primaryCityId:'1302603'})),{primary_city_id:'1302603'});
});
test('alterações por favorito preservam cidades de outro aparelho; cap permite substituição',()=>{
  let metadata={favorite_city_ids:['1302603']};
  metadata={...metadata,...applyOperations(metadata,operationsInput({favoriteChanges:[{cityId:'3550308',enabled:true}]}))};
  metadata={...metadata,...applyOperations(metadata,operationsInput({favoriteChanges:[{cityId:'4106902',enabled:true},{cityId:'1302603',enabled:false}]}))};
  assert.deepEqual(metadata.favorite_city_ids,['3550308','4106902']);
  const cities=Array.from({length:30},(_,i)=>String(1000000+i));
  assert.throws(()=>applyOperations({favorite_city_ids:cities},operationsInput({favoriteChanges:[{cityId:'3550308',enabled:true}]})),/favorite_limit/);
  const patch=applyOperations({favorite_city_ids:cities},operationsInput({favoriteChanges:[{cityId:'3550308',enabled:true},{cityId:cities[0],enabled:false}]}));assert.equal(patch.favorite_city_ids.length,30);
});
test('operações independentes em locais se combinam; mesmo local exige versão e preserva exclusão',()=>{
  let metadata={named_places_v1:[place]};
  metadata={...metadata,...applyOperations(metadata,operationsInput({placeChanges:[operation('place-2',null,'Trabalho')]}),200)};
  metadata={...metadata,...applyOperations(metadata,operationsInput({placeChanges:[operation('place-1',100,'Lar')]}),300)};
  assert.equal(snapshot(metadata).namedPlaces.length,2);assert.equal(snapshot(metadata).namedPlaces.find(p=>p.id==='place-1').name,'Lar');
  assert.throws(()=>applyOperations(metadata,operationsInput({placeChanges:[operation('place-1',100,'Faculdade')]})),/preference_conflict/);
  metadata={...metadata,...applyOperations(metadata,operationsInput({placeChanges:[{id:'place-1',expectedUpdatedAt:300,deleted:true}]}),400)};
  assert.throws(()=>applyOperations(metadata,operationsInput({placeChanges:[operation('place-1',300,'Casa')]})),/preference_conflict/);
});
test('repetir salvamento/deleção após resposta perdida é idempotente; relógio do cliente não define versão',()=>{
  const change=operationsInput({placeChanges:[operation('place-1',100,'Lar')]});
  const metadata={named_places_v1:applyOperations({named_places_v1:[place]},change,200).named_places_v1};
  assert.equal(applyOperations(metadata,change,900).named_places_v1[0].updatedAt,200);
  const removed={named_places_v1:applyOperations(metadata,operationsInput({placeChanges:[{id:'place-1',expectedUpdatedAt:200,deleted:true}]}),300).named_places_v1};
  assert.equal(applyOperations(removed,operationsInput({placeChanges:[{id:'place-1',expectedUpdatedAt:200,deleted:true}]}),999).named_places_v1[0].updatedAt,300);
  assert.equal(applyOperations({named_places_v1:[{...place,updatedAt:900}]},operationsInput({placeChanges:[operation('place-1',900,'Novo')]}),100).named_places_v1[0].updatedAt,901);
});
test('valida entrada, limites e campos esperados antes de qualquer escrita',()=>{
  for(const value of [null,[],{user_id:'other'},{primaryCityId:1302603},{favoriteChanges:[{cityId:'1302603',enabled:'true'}]},{placeChanges:[{id:'place-1',deleted:true}]},{placeChanges:[operation('place-1',null,' ')]}]) assert.throws(()=>operationsInput(value),/invalid_operations/);
  const places=Array.from({length:20},(_,i)=>({...place,id:'place-'+i}));
  assert.throws(()=>applyOperations({named_places_v1:places},operationsInput({placeChanges:[operation('new',null,'Novo')]})),/place_limit/);
});
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/account-preferences/index.ts','utf8').replace(/^import .*;\n/gm,''));
function handler({metadata={},onWrite,unauthenticated=false}={}){
  let serve,writes=0,current=structuredClone(metadata);
  const admin={rpc:async(name,parameters)=>{writes++;if(onWrite)current=onWrite(current,parameters,writes);if(JSON.stringify(parameters.p_expected)!==JSON.stringify(current))return {data:false};current={...current,...parameters.p_patch};return {data:true};},auth:{admin:{getUserById:async()=>({data:{user:{id:'owner',user_metadata:structuredClone(current)}}})}}};
  const context={Error,SyntaxError,Deno:{serve:fn=>serve=fn},authenticatedUser:async()=>unauthenticated ? null : {id:'owner',user_metadata:structuredClone(current)},adminClient:()=>admin,
    json:(req,body,status=200)=>({body,status}),readJson:req=>req.body,preflight:()=>({status:204}),snapshot,operationsInput,applyOperations,console:{warn(){}}};
  vm.runInNewContext(source,context);
  return {invoke:(operations,ownerId='owner')=>serve({method:'POST',body:{action:'apply',ownerId,operations}}),read:()=>serve({method:'POST',body:{action:'read',ownerId:'owner'}}),get writes(){return writes;},get metadata(){return current;}};
}
test('endpoint rejeita outra identidade e anonimato antes de escrever',async()=>{
  const service=handler();assert.equal((await service.invoke({primaryCityId:'1302603'},'other')).status,409);assert.equal(service.writes,0);
  const guest=handler({unauthenticated:true});assert.equal((await guest.invoke({})).status,401);assert.equal(guest.writes,0);
});
test('CAS rebaseia favorito concorrente e alteração do nome; nenhuma preferência alheia é perdida',async()=>{
  const service=handler({metadata:{name:'Anterior',favorite_city_ids:['1302603']},onWrite:(metadata,params,attempt)=>attempt===1 ? {...metadata,name:'Novo',favorite_city_ids:['1302603','4106902']} : metadata});
  const response=await service.invoke({favoriteChanges:[{cityId:'3550308',enabled:true}]});
  assert.equal(response.status,200);assert.equal(service.writes,2);assert.equal(service.metadata.name,'Novo');assert.deepEqual(service.metadata.favorite_city_ids,['1302603','4106902','3550308']);
});
test('edição concorrente do mesmo local retorna snapshot e conflito sem sobrescrever',async()=>{
  const service=handler({metadata:{named_places_v1:[place]},onWrite:(metadata,params,attempt)=>attempt===1 ? {...metadata,named_places_v1:[{...place,name:'Outro',updatedAt:200}]} : metadata});
  const response=await service.invoke({placeChanges:[operation('place-1',100,'Meu nome')]});
  assert.equal(response.status,409);assert.equal(response.body.code,'preference_conflict');assert.equal(response.body.snapshot.namedPlaces[0].name,'Outro');assert.equal(service.writes,1);
});
test('concorrência contínua tem retry limitado; leitura não grava dados',async()=>{
  const service=handler({onWrite:(metadata,params,attempt)=>({...metadata,name:String(attempt)})});
  assert.equal((await service.read()).status,200);assert.equal(service.writes,0);
  const response=await service.invoke({primaryCityId:'1302603'});assert.equal(response.status,409);assert.equal(response.body.code,'sync_busy');assert.equal(service.writes,3);assert.equal(service.metadata.primary_city_id,undefined);
});
test('nome é validado e gravação concorrente preserva favoritos e locais',async()=>{
  for(const displayName of [null,42,' \u0000 ']) assert.throws(()=>operationsInput({displayName}),/invalid_operations/);
  const service=handler({metadata:{name:'Antes',named_places_v1:[place]},onWrite:(metadata,params,attempt)=>attempt===1 ? {...metadata,favorite_city_ids:['3550308']} : metadata});
  const response=await service.invoke({displayName:'  Depois\u0000  '});
  assert.equal(response.status,200);assert.equal(response.body.snapshot.displayName,'Depois');assert.equal(service.writes,2);
  assert.deepEqual(service.metadata.favorite_city_ids,['3550308']);assert.deepEqual(service.metadata.named_places_v1,[place]);
});
