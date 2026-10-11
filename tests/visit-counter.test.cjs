const {test}=require('node:test'),assert=require('node:assert/strict');
const counter=require('../dist/modules/visit-counter.js');
function setup(extra={}){
 const store=new Map(extra.saved?[['pluvia-visit-day',extra.saved]]:[]),calls=[];
 const storage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))};
 const fetchImpl=async(url,init)=>{calls.push({url,init});return {ok:true};};
 return {store,calls,opts:{storage,fetchImpl,navigator:{},window:{},host:'pluviaweather.com.br',now:new Date('2026-10-11T02:30:00Z'),...extra.opts}};
}
test('dia segue Brasília, não UTC',()=>{
 assert.equal(counter.today(new Date('2026-10-11T02:30:00Z')),'2026-10-10');
 assert.equal(counter.today(new Date('2026-10-11T03:00:00Z')),'2026-10-11');
});
test('conta uma vez por dia sem enviar nada além do +1',async()=>{
 const s=setup();
 assert.equal(await counter.count(s.opts),true);
 assert.equal(s.calls.length,1);
 assert.match(s.calls[0].url,/\/rest\/v1\/rpc\/pluvia_count_visit$/);
 assert.equal(s.calls[0].init.body,'{}');
 assert.equal(s.calls[0].init.credentials,'omit');
 assert.equal(s.calls[0].init.referrerPolicy,'no-referrer');
 assert.equal(s.store.get('pluvia-visit-day'),'2026-10-10');
 assert.equal(await counter.count(s.opts),false,'mesmo dia não conta de novo');
 assert.equal(await counter.count({...s.opts,now:new Date('2026-10-11T15:00:00Z')}),true,'dia seguinte conta');
 assert.equal(s.calls.length,2);
});
test('não conta fora do domínio, com DNT/GPC ou sem storage',async()=>{
 for(const opts of [{host:'localhost'},{host:'pluvia-git-x.vercel.app'},{navigator:{doNotTrack:'1'}},{navigator:{globalPrivacyControl:true}},{window:{doNotTrack:'1'}},{storage:{getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}}},{storage:{getItem:()=>null,setItem(){}}}]){
  const s=setup({opts});
  assert.equal(await counter.count(s.opts),false,JSON.stringify(Object.keys(opts)));
  assert.equal(s.calls.length,0);
 }
});
test('falha de rede nunca lança',async()=>{
 const s=setup({opts:{fetchImpl:async()=>{throw new TypeError('Load failed');}}});
 assert.equal(await counter.count(s.opts),false);
 assert.equal(s.store.get('pluvia-visit-day'),'2026-10-10','não tenta de novo no mesmo dia');
});
