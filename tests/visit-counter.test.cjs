const {test}=require('node:test'),assert=require('node:assert/strict');
const counter=require('../dist/modules/visit-counter.js');
const CONSENT_KEY='pluvia-analytics-consent-v1';
const DEVICE='11111111-1111-4111-8111-111111111111';

function setup(extra={}){
 const initial=[];
 if(extra.saved)initial.push(['pluvia-visit-day',extra.saved]);
 if(extra.consent)initial.push([CONSENT_KEY,'1']);
 const store=new Map(initial),calls=[];
 const storage={
  getItem:k=>store.has(k)?store.get(k):null,
  setItem:(k,v)=>store.set(k,String(v)),
  removeItem:k=>store.delete(k)
 };
 const fetchImpl=async(url,init)=>{calls.push({url,init});return {ok:true};};
 return {
  store,calls,
  opts:{
   storage,fetchImpl,navigator:{},window:{},crypto:{randomUUID:()=>DEVICE},
   host:'pluviaweather.com.br',now:new Date('2026-10-11T02:30:00Z'),
   ...extra.opts
  }
 };
}

test('dia segue Brasília, não UTC',()=>{
 assert.equal(counter.today(new Date('2026-10-11T02:30:00Z')),'2026-10-10');
 assert.equal(counter.today(new Date('2026-10-11T03:00:00Z')),'2026-10-11');
});

test('não envia contagem antes do consentimento',async()=>{
 const s=setup();
 assert.equal(await counter.count(s.opts),false);
 assert.equal(s.calls.length,0);
 assert.equal(s.store.has('pluvia-visit-day'),false);
});

test('com consentimento conta uma vez por dia e envia só o UUID aleatório',async()=>{
 const s=setup({consent:true});
 assert.equal(await counter.count(s.opts),true);
 assert.equal(s.calls.length,1);
 assert.match(s.calls[0].url,/\/rest\/v1\/rpc\/pluvia_count_visit$/);
 assert.equal(s.calls[0].init.method,'POST');
 assert.deepEqual(JSON.parse(s.calls[0].init.body),{p_device_id:DEVICE});
 assert.equal(s.calls[0].init.credentials,'omit');
 assert.equal(s.calls[0].init.referrerPolicy,'no-referrer');
 assert.equal(s.store.get('pluvia-visit-day'),'2026-10-10');
 assert.equal(s.store.get('pluvia-visit-device'),DEVICE);
 assert.equal(await counter.count(s.opts),false,'mesmo dia não conta de novo');
 assert.equal(await counter.count({...s.opts,now:new Date('2026-10-11T15:00:00Z')}),true,'dia seguinte conta');
 assert.equal(s.calls.length,2);
});

test('não conta fora do domínio, com DNT/GPC ou sem storage',async()=>{
 for(const opts of [
  {host:'localhost'},
  {host:'pluvia-git-x.vercel.app'},
  {navigator:{doNotTrack:'1'}},
  {navigator:{globalPrivacyControl:true}},
  {window:{doNotTrack:'1'}},
  {storage:{getItem(){throw new Error('blocked');},setItem(){},removeItem(){}}},
  {storage:{getItem:()=>null,setItem(){},removeItem(){}}}
 ]){
  const s=setup({consent:true,opts});
  assert.equal(await counter.count(s.opts),false,JSON.stringify(Object.keys(opts)));
  assert.equal(s.calls.length,0);
 }
});

test('falha de rede não lança e permite nova tentativa',async()=>{
 const s=setup({consent:true,opts:{fetchImpl:async()=>{throw new TypeError('Load failed');}}});
 assert.equal(await counter.count(s.opts),false);
 assert.equal(s.store.has('pluvia-visit-day'),false);
 s.opts.fetchImpl=async(url,init)=>{s.calls.push({url,init});return {ok:true};};
 assert.equal(await counter.count(s.opts),true);
 assert.equal(s.calls.length,1);
});

test('resposta HTTP malsucedida não bloqueia uma tentativa posterior',async()=>{
 const s=setup({consent:true,opts:{fetchImpl:async()=>({ok:false})}});
 assert.equal(await counter.count(s.opts),false);
 assert.equal(s.store.has('pluvia-visit-day'),false);
 s.opts.fetchImpl=async(url,init)=>{s.calls.push({url,init});return {ok:true};};
 assert.equal(await counter.count(s.opts),true);
 assert.equal(s.calls.length,1);
});
