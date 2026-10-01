const {test}=require('node:test'),assert=require('node:assert/strict');
const {check,checks}=require('../scripts/check-production.cjs');
test('diagnóstico separa rede, timeout, limite e resposta inválida sem registrar URL ou erro bruto',async()=>{
 const item={component:'weather',url:'https://private.test/?secret=token&lat=precise',valid:v=>typeof v.current==='number'};
 for(const [fetchImpl,code] of [[async()=>{throw Error('private details');},'network_error'],[async()=>{throw new DOMException('private','TimeoutError');},'timeout'],[async()=>({ok:false,status:429}),'rate_limited'],[async()=>({ok:true,json:async()=>({current:null})}),'invalid_response'],[async()=>({ok:true,json:async()=>{throw Error('bad');}}),'invalid_response']]){const result=await check(item,fetchImpl);assert.equal(result.code,code);assert.equal(result.ok,false);assert.doesNotMatch(JSON.stringify(result),/private|secret|precise/);}
 assert.equal((await check(item,async()=>({ok:true,json:async()=>({current:30})}))).ok,true);
 assert(!checks.some(item=>/functions\/v1|posthog|lightning|recover|signup|user/.test(item.url)));
});
