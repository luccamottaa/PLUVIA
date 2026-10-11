const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const code=fs.readFileSync(__dirname+'/../dist/notifications.js','utf8');
const handler=code.slice(code.indexOf('  window.addEventListener("pluvia:auth-changed"'),code.indexOf('  // Na abertura só com sessão anônima'));

function run({anon,locations=[]}){
  const store=anon?{'pluvia-push-anon':'1'}:{},registered=[];let listener;
  const c=vm.createContext({
    window:{addEventListener(type,fn){listener=fn;}},
    localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v;},removeItem:k=>{delete store[k];}},
    config:null,configOwner:'u1',configRevision:0,pendingEnable:false,supported:true,Notification:{permission:'granted'},
    paintPreferences(){},paintDevices(){},paintLocations(){},paintCityChoices(){},paintState:async()=>{},setPendingEnable(){},reportOpened(){},message(){},
    el:()=>({disabled:false}),loadConfig:async()=>({locations}),browserSubscription:async()=>({endpoint:'e'}),
    register:async(sub,location)=>registered.push(location),currentLocation:()=>({cityId:'1302603'}),
  });
  vm.runInContext(code.slice(code.indexOf('  const ANON_KEY'),code.indexOf('  const toggle =')),c);
  vm.runInContext(handler,c);
  return {store,registered,fire:()=>listener({detail:{user:{id:'u1'}}})};
}
test('entrar depois de ligar avisos sem conta leva a cidade aberta uma vez',async()=>{
  const r=run({anon:true});await r.fire();
  assert.deepEqual(r.registered,[{cityId:'1302603'}]);assert.equal(r.store['pluvia-push-anon'],undefined);
  await r.fire();assert.equal(r.registered[1],null,'na próxima renovação não religa cidade');
});
test('recarregar com conta sem cidades (depois de "Parar avisos") não religa a cidade aberta',async()=>{
  const r=run({anon:false});await r.fire();
  assert.deepEqual(r.registered,[null]);
});
