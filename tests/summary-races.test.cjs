const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const smartSummary=require('../dist/modules/smart-summary.js');const {forecast,city}=require('./support/forecast.cjs');
const source=fs.readFileSync('dist/app.js','utf8');
function setup() {
 const requests=[],painted=[],statuses=[];let user={id:'user-a'};
 const context=vm.createContext({smartSummary,activeCity:city,cityRevision:0,summaryAiInFlight:null,summaryAiUnavailableUntil:0,
  displayedWeather:{forecast:forecast(),air:null},selectCurrentHour:()=>1,AbortController,setTimeout,clearTimeout,
  pluviaAccount:{getUser:()=>user,getClient:async()=>({functions:{invoke:(name,options)=>new Promise(resolve=>requests.push({resolve,options}))}})},
  $:()=>({setAttribute:(name,status)=>statuses.push(status)}),saveSummary(){},paintSummary:summary=>painted.push(summary),applyOfficialAlertPriority(){}});
 vm.runInContext(source.slice(source.indexOf('function cancelSummaryRequest('),source.indexOf('function renderAttention(')),context);
 const current=()=>smartSummary.buildContext(context.displayedWeather.forecast,null,1,city);
 const resolve=index=>requests[index].resolve({data:{available:true,summary:{...smartSummary.deterministic(requests[index].options.body.context),source:'ai'}}});
 return {context,requests,painted,statuses,current,resolve,setUser:value=>user=value};
}
test('resposta antiga da mesma cidade não sobrescreve previsão nova nem encerra a nova consulta',async()=>{
 const s=setup(),old=s.context.enhanceSummary(s.current());await new Promise(resolve=>setImmediate(resolve));
 s.context.displayedWeather.forecast.hourly.weather_code[2]=95;
 const next=s.context.enhanceSummary(s.current());await new Promise(resolve=>setImmediate(resolve));
 assert.equal(s.requests.length,2);assert.equal(s.requests[0].options.signal.aborted,true);
 s.resolve(0);await old;assert.equal(s.painted.length,0);assert.ok(s.context.summaryAiInFlight);
 s.resolve(1);await next;assert.equal(s.painted.length,1);assert.equal(s.statuses.at(-1),'ready');
});
test('troca de cidade e logout impedem respostas pendentes de alterar o card',async()=>{
 for(const change of [s=>s.context.cityRevision++,s=>s.setUser(null)]) {
  const s=setup(),request=s.context.enhanceSummary(s.current());await new Promise(resolve=>setImmediate(resolve));change(s);s.resolve(0);await request;
  assert.equal(s.painted.length,0);assert.notEqual(s.statuses.at(-1),'ready');
 }
});
test('cancelamento antes de obter o cliente não consulta a função nem cria cooldown',async()=>{
 const s=setup(),request=s.context.enhanceSummary(s.current());s.context.cancelSummaryRequest();await request;
 assert.equal(s.requests.length,0);assert.equal(s.context.summaryAiUnavailableUntil,0);
});
