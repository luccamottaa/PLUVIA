const fs=require('node:fs'),vm=require('node:vm');
const model=require('../../supabase/functions/_shared/account-preferences.js');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function boot({user={id:'owner-a',email:'user@example.test',user_metadata:{}},storage=new Map(),invoke}={}){
  const nodes=new Map(),events=new Map(),documentEvents=new Map(),timers=new Map(),writes=[];
  let timerId=0,listener,current=user;
  const element=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,textContent:'',events:{},setAttribute(){},focus(){},showModal(){this.open=true;},close(){this.open=false;},addEventListener(type,fn){this.events[type]=fn;}});return nodes.get(id);};
  const auth={onAuthStateChange(fn){listener=fn;},getSession:async()=>({data:{session:current ? {user:current} : null}}),updateUser:async({data})=>{current.user_metadata={...current.user_metadata,...data};return {data:{user:current}};}};
  const client={auth,functions:{invoke:async(name,options)=>{
    writes.push(options.body);
    if(invoke)return invoke(name,options,current);
    if(options.body.ownerId!==current?.id)return {error:{context:{json:async()=>({code:'account_changed',error:'A conta mudou.'})}}};
    if(options.body.action==='apply')current.user_metadata={...current.user_metadata,...model.applyOperations(current.user_metadata,model.operationsInput(options.body.operations))};
    return {data:{snapshot:model.snapshot(current.user_metadata)}};
  }}};
  const context=vm.createContext({URL,URLSearchParams,AbortController,AbortSignal,Date,Intl,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
    setTimeout(fn,ms){const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},
    document:{getElementById:element,createElement:()=>({}),head:{appendChild(script){script.onload();}},addEventListener:(type,fn)=>documentEvents.set(type,fn),visibilityState:'visible'},
    supabase:{createClient:()=>client},localStorage:{getItem:key=>storage.get(key) || null,setItem:(key,value)=>storage.set(key,value)},
    favorites:new Set(JSON.parse(storage.get('pluvia-favorites') || '[]')),writePreference:(key,value)=>storage.set(key,JSON.stringify(value)),readPreference:()=>true,
    renderCityOptions(){},updateCityLabels(){},addEventListener(type,fn){if(!events.has(type))events.set(type,[]);events.get(type).push(fn);},
    dispatchEvent(event){for(const fn of events.get(event.type)||[])fn(event);}});
  context.window=context;
  vm.runInContext(fs.readFileSync('dist/modules/account-sync.js','utf8'),context);
  vm.runInContext(fs.readFileSync('dist/modules/social-auth.js','utf8'),context);
  vm.runInContext(fs.readFileSync('dist/account.js','utf8'),context);
  return {context,nodes,events,timers,writes,storage,user,client,settle,
    async flush(){const pending=[...timers.entries()];timers.clear();for(const [,timer]of pending)await timer.fn();await settle();},
    switchUser(next,event){current=next;listener(event || (next?'SIGNED_IN':'SIGNED_OUT'),next?{user:next}:null);},
    fire(type,detail){context.dispatchEvent({type,detail});},
    favorites(ids){context.favorites.clear();ids.forEach(id=>context.favorites.add(id));storage.set('pluvia-favorites',JSON.stringify(ids));context.dispatchEvent({type:'pluvia:favorites-changed',detail:{ids}});}};
}
module.exports={boot,settle};
