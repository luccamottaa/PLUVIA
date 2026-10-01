const {test}=require('node:test'),assert=require('node:assert/strict');
const model=require('../dist/modules/account-sync.js');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const snapshot={favoriteCityIds:['1302603'],primaryCityId:null,namedPlaces:[]};
test('diferença descreve somente cidades adicionadas/removidas',()=>{
  assert.deepEqual(model.difference(['1302603','3550308'],['3550308','4106902']),[{cityId:'1302603',enabled:false},{cityId:'4106902',enabled:true}]);
});
test('trocar conta aborta consulta e ignora resposta atrasada, inclusive A → B → A',async()=>{
  let user={id:'a'},resolve,signal;const published=[];
  const sync=model.create({getUser:()=>user,getClient:async()=>({functions:{invoke:async(name,options)=>{signal=options.signal;return new Promise(done=>resolve=done);}}}),onSnapshot:value=>published.push(value)});
  sync.setUser(user);const pending=sync.load();await settle();
  user={id:'b'};sync.setUser(user);user={id:'a'};sync.setUser(user);
  const rejection=assert.rejects(pending,error=>error.code==='account_changed');resolve({data:{snapshot}});await rejection;
  assert.equal(signal.aborted,true);assert.equal(published.length,0);assert.equal(sync.getSnapshot(),null);
});
test('leitura é deduplicada e serializada antes da escrita; request identifica o proprietário',async()=>{
  const user={id:'a'},calls=[],published=[];let resolve;
  const sync=model.create({getUser:()=>user,getClient:async()=>({functions:{invoke:(name,options)=>{calls.push(options);return calls.length===1 ? new Promise(done=>resolve=done) : Promise.resolve({data:{snapshot:{...snapshot,favoriteCityIds:[]}}});}}}),onSnapshot:value=>published.push(value)});
  sync.setUser(user);const first=sync.load(),same=sync.load(),writing=sync.apply({favoriteChanges:[{cityId:'1302603',enabled:false}]});
  assert.equal(first,same);await settle();assert.equal(calls.length,1);resolve({data:{snapshot}});await writing;
  assert.equal(calls[1].body.ownerId,'a');assert.equal(calls[1].timeout,15000);assert.deepEqual(sync.getSnapshot().favoriteCityIds,[]);assert.equal(published.length,2);
});
test('conflito aplica snapshot mais recente e mantém erro compreensível',async()=>{
  const user={id:'a'},published=[];
  const sync=model.create({getUser:()=>user,getClient:async()=>({functions:{invoke:async()=>({error:{context:{json:async()=>({error:'Confira a lista.',code:'preference_conflict',snapshot})}}})}}),onSnapshot:value=>published.push(value)});
  sync.setUser(user);await assert.rejects(sync.apply({}),error=>error.code==='preference_conflict');assert.equal(published.length,1);
});
