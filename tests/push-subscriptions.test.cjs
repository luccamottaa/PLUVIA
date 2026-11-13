const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/push-subscriptions/index.ts','utf8').replace(/^import .*;\n/gm,''));
const city={cityId:'1302603',cityName:'Manaus',uf:'AM',latitude:-3.1,longitude:-60,timezone:'America/Manaus',source:'saved_city'};
function server({user={id:'owner'},errors={}}={}) {
 let handler;const writes=[],reads=[];
 const admin={from(table){const chain={select(){return chain;},eq(field,value){reads.push({table,field,value});return chain;},order(){return chain;},maybeSingle(){return chain;},single(){return chain;},upsert(values,options){writes.push({table,values,options});return chain;},insert(values){writes.push({table,op:'insert',values});return chain;},update(values){writes.push({table,op:'update',values});return chain;},delete(){writes.push({table,op:'delete'});return chain;},limit(){return chain;},then(resolve,reject){return Promise.resolve({data:table==='notification_preferences'?{official_alerts:false}:[],error:(typeof errors[table]==='function'?errors[table]():errors[table])||null}).then(resolve,reject);}};return chain;}};
 vm.runInNewContext(source,{Deno:{serve:fn=>handler=fn},adminClient:()=>admin,authenticatedUser:async()=>user,pushSecrets:async()=>({vapid_public_key:'public'}),retryPause:async()=>{},readJson:async req=>req.body,preflight:()=>({status:204}),json:(req,body,status=200)=>({body,status}),console:{error(){}},report:()=>{},allowedPushEndpoint:require('../supabase/functions/_shared/push-endpoint.ts').allowedPushEndpoint});
 return {writes,reads,request:body=>handler({method:'POST',body})};
}
test('salvar vários municípios preserva falsos e atribui todas as linhas ao usuário autenticado',async()=>{
 const s=server();const response=await s.request({action:'preferences',user_id:'intruder',preferences:{official_alerts:false,storms:false,daily_summary:true,user_id:'intruder'},location:city,locations:[city,{...city,cityId:'2611606',cityName:'Recife',uf:'PE',user_id:'intruder'}]});
 assert.equal(response.status,200);assert.equal(s.writes.length,2);
 const prefs=s.writes[0].values;assert.equal(prefs.user_id,'owner');assert.equal(prefs.official_alerts,false);assert.equal(prefs.storms,false);
 const locations=s.writes[1].values;assert.equal(locations.length,2);for(const item of locations) assert.equal(item.user_id,'owner');
 assert.equal(s.writes[1].options.onConflict,'user_id,city_id,kind');for(const item of locations) assert.equal(item.kind,'city');
});
test('salvar só tipos não cadastra nem remove cidades',async()=>{
 const s=server();assert.equal((await s.request({action:'preferences',preferences:{rain_approaching:false}})).status,200);
 assert.equal(s.writes.length,1);assert.equal(s.writes[0].table,'notification_preferences');
});
test('lote inválido é rejeitado inteiro antes de gravar preferências ou cidades',async()=>{
 for(const locations of [{},[null],[{...city,latitude:null}],[{...city,cityId:'13026030'}],Array(31).fill(city)]) {
  const s=server();assert.equal((await s.request({action:'preferences',preferences:{storms:false},locations})).status,400);assert.equal(s.writes.length,0);
 }
});
test('config é leitura do usuário e falha visivelmente quando uma consulta falha',async()=>{
 const s=server();const response=await s.request({action:'config'});assert.equal(response.status,200);assert.equal(response.body.preferences.official_alerts,false);assert.equal(s.writes.length,0);
 assert.equal(s.reads.length,3);for(const read of s.reads) assert.equal(read.value,'owner');
 const failed=server({errors:{notification_preferences:{message:'database unavailable'}}});assert.equal((await failed.request({action:'config'})).status,503);
});
test('sem autenticação, preferências não podem ser lidas ou alteradas',async()=>{
 const s=server({user:null});assert.equal((await s.request({action:'preferences',locations:[city]})).status,401);assert.equal(s.writes.length,0);assert.equal(s.reads.length,0);
});
test('cadastro rejeita endpoint arbitrário antes de qualquer escrita',async()=>{
 const s=server();const response=await s.request({action:'register',subscription:{endpoint:'https://127.0.0.1/private',keys:{p256dh:'A'.repeat(60),auth:'B'.repeat(24)}}});
 assert.equal(response.status,400);assert.equal(s.writes.length,0);
});
test('config repete uma vez quando a leitura falha logo depois de a função acordar',async()=>{
 let fails=1;const s=server({errors:{notification_preferences:()=>fails-->0?{message:'cold start'}:null}});
 const response=await s.request({action:'config'});assert.equal(response.status,200);assert.equal(s.reads.length,6);
 const twice=server({errors:{notification_preferences:()=>({message:'still down'})}});assert.equal((await twice.request({action:'config'})).status,503);assert.equal(twice.reads.length,6,'só uma repetição');
});

test('sem a migration do ponto, cidades voltam à chave antiga (user_id, city_id)',async()=>{
 let first=true;const s=server({errors:{notification_locations:()=>first?(first=false,{code:'42P10'}):null}});
 assert.equal((await s.request({action:'preferences',preferences:{storms:true},locations:[city]})).status,200);
 const writes=s.writes.filter(w=>w.table==='notification_locations');
 assert.equal(writes.length,2);assert.equal(writes[1].options.onConflict,'user_id,city_id');assert.equal('kind' in writes[1].values[0],false);
});
test('ponto "Minha localização": arredondado a 2 casas, um por usuário, e apagado ao desligar',async()=>{
 const s=server();
 const response=await s.request({action:'point',user_id:'intruder',point:{...city,latitude:-3.123456,longitude:-60.019876,user_id:'intruder'}});
 assert.equal(response.status,200);
 const write=s.writes.find(w=>w.table==='notification_locations');
 assert.equal(write.op,'insert');assert.equal(write.values.user_id,'owner');assert.equal(write.values.kind,'point');
 assert.equal(write.values.latitude,-3.12);assert.equal(write.values.longitude,-60.02);
 assert.ok(s.reads.some(r=>r.field==='kind'&&r.value==='point'));
 const off=server();assert.equal((await off.request({action:'remove_point'})).status,200);
 assert.equal(off.writes[0].op,'delete');assert.ok(off.reads.some(r=>r.field==='user_id'&&r.value==='owner'));assert.ok(off.reads.some(r=>r.field==='kind'&&r.value==='point'));
 const bad=server();assert.equal((await bad.request({action:'point',point:{...city,latitude:120}})).status,400);assert.equal(bad.writes.length,0);
 const legacy=server({errors:{notification_locations:{code:'42703'}}});assert.equal((await legacy.request({action:'point',point:city})).status,409);
});
