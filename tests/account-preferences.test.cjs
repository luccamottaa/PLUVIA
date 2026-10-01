const {test}=require('node:test'),assert=require('node:assert/strict');
const {boot,settle}=require('./support/account.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
test('favoritos e cidade são operações combinadas; sair cancela a fila sem escrever na outra conta',async()=>{
  const page=boot();await settle();
  page.favorites(['1302603']);page.fire('pluvia:city-changed',{id:'3550308'});
  assert.equal(page.timers.size,1);await page.flush();
  assert.deepEqual(copy(page.writes.filter(r=>r.action==='apply').at(-1)),{action:'apply',ownerId:'owner-a',operations:{favoriteChanges:[{cityId:'1302603',enabled:true}],primaryCityId:'3550308'}});
  page.fire('pluvia:city-changed',{id:'1302603'});page.switchUser(null);assert.equal(page.timers.size,0);
});
test('refresh não ressuscita favorito removido nem envia a lista inteira',async()=>{
  const user={id:'owner-a',user_metadata:{favorite_city_ids:['1302603','3550308']}},page=boot({user});await settle();
  page.favorites(['3550308']);await page.flush();
  assert.deepEqual(user.user_metadata.favorite_city_ids,['3550308']);
  page.switchUser(user);await page.flush();
  assert.deepEqual([...page.context.favorites],['3550308']);
  assert.equal(page.writes.filter(r=>r.action==='apply').length,1);
});
test('falha conserva operações no dispositivo; outra conta não recebe a fila',async()=>{
  let offline=false;
  const page=boot({invoke:async(name,{body},user)=>offline && body.action==='apply' ? {error:{}} : {data:{snapshot:{favoriteCityIds:user.user_metadata.favorite_city_ids || [],primaryCityId:null,namedPlaces:[]}}}});
  await settle();offline=true;page.favorites(['1302603']);await page.flush();
  assert.equal(JSON.parse(page.storage.get('pluvia-account-pending-owner-a')).favoriteChanges['1302603'],true);
  page.switchUser({id:'owner-b',user_metadata:{favorite_city_ids:['3550308']}});await page.flush();
  assert.deepEqual([...page.context.favorites],['3550308']);
  assert.equal(page.writes.some(r=>r.ownerId==='owner-b' && r.action==='apply'),false);
});
test('reload retoma adição e remoção pendentes no proprietário correto',async()=>{
  const storage=new Map([['pluvia-favorites-owner','owner-a'],['pluvia-account-pending-owner-a',JSON.stringify({favoriteChanges:{'1302603':false,'3550308':true}})]]);
  const user={id:'owner-a',user_metadata:{favorite_city_ids:['1302603']}},page=boot({user,storage});
  await settle();await page.flush();
  assert.deepEqual(user.user_metadata.favorite_city_ids,['3550308']);
  assert.deepEqual(JSON.parse(storage.get('pluvia-account-pending-owner-a')).favoriteChanges,{});
});
test('mudança durante request mantém a intenção mais nova e persiste também o lote em voo',async()=>{
  let resolve;
  const page=boot({invoke:async(name,{body})=>body.action==='read' ? {data:{snapshot:{favoriteCityIds:[],primaryCityId:null,namedPlaces:[]}}} : new Promise(done=>resolve=done)});
  await settle();page.favorites(['1302603']);
  const flushing=page.flush();await settle();page.favorites([]);page.fire('pluvia:city-changed',{id:'3550308'});
  const outbox=JSON.parse(page.storage.get('pluvia-account-pending-owner-a'));
  assert.equal(outbox.favoriteChanges['1302603'],false);assert.equal(outbox.primaryCityId,'3550308');
  resolve({data:{snapshot:{favoriteCityIds:['1302603'],primaryCityId:null,namedPlaces:[]}}});await flushing;
  assert.deepEqual([...page.context.favorites],[]);
  const remaining=JSON.parse(page.storage.get('pluvia-account-pending-owner-a'));assert.equal(remaining.favoriteChanges['1302603'],false);
});
test('revalidação conserva nome digitado; troca de conta limpa campo focado',async()=>{
  const page=boot({user:{id:'owner-a',user_metadata:{name:'Primeiro'}}});await settle();
  const input=page.context.document.getElementById('profileName');page.context.document.activeElement=input;input.value='Editando';
  await page.context.pluviaAccount.syncPreferences();assert.equal(input.value,'Editando');
  page.switchUser({id:'owner-b',user_metadata:{name:'Segundo'}});assert.equal(input.value,'Segundo');
  await settle();page.switchUser(null);assert.equal(input.value,'');
});
test('salvamento do nome em voo não pinta nem fecha diálogo de outra conta',async()=>{
  let resolve;
  const page=boot({invoke:async(name,{body},user)=>body.action==='read' ? {data:{snapshot:{displayName:user.user_metadata.name || '',favoriteCityIds:[],namedPlaces:[]}}} : new Promise(done=>resolve=done)});
  await settle();const input=page.context.document.getElementById('profileName'),dialog=page.context.document.getElementById('accountDialog');
  input.value='Nome A';dialog.open=true;
  const saving=page.context.document.getElementById('profileForm').events.submit({preventDefault(){}});await settle();
  page.switchUser({id:'owner-b',user_metadata:{name:'Nome B'}});await settle();
  resolve({data:{snapshot:{displayName:'Nome A',favoriteCityIds:[],namedPlaces:[]}}});await saving;
  assert.equal(page.context.document.getElementById('profileDisplayName').textContent,'Nome B');assert.equal(dialog.open,true);
});
test('leitura anterior ao lote em voo não desfaz favorito local; importação respeita o limite',async()=>{
  let resolveRead,resolveApply,delay=false;
  const page=boot({invoke:async(name,{body})=>body.action==='read' ? delay ? new Promise(done=>resolveRead=done) : {data:{snapshot:{favoriteCityIds:[],namedPlaces:[]}}} : new Promise(done=>resolveApply=done)});
  await settle();delay=true;const reading=page.context.pluviaAccount.syncPreferences();await settle();
  page.favorites(['1302603']);const flushing=page.flush();await settle();
  resolveRead({data:{snapshot:{favoriteCityIds:[],namedPlaces:[]}}});await reading;await settle();
  assert.deepEqual([...page.context.favorites],['1302603']);
  resolveApply({data:{snapshot:{favoriteCityIds:['1302603'],namedPlaces:[]}}});await flushing;
  const cities=Array.from({length:30},(_,i)=>String(1000000+i));
  const capped=boot({user:{id:'owner-a',user_metadata:{favorite_city_ids:cities}},storage:new Map([['pluvia-favorites','["1302603"]']])});await settle();await capped.flush();
  assert.equal(capped.context.favorites.size,30);assert.equal(capped.user.user_metadata.favorite_city_ids.length,30);
});
