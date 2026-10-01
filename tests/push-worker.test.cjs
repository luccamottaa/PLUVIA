const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/push-process/index.ts','utf8').replace(/^import .*;\n/gm,''));
const pure=vm.runInNewContext(source.slice(0,source.indexOf('Deno.serve('))+';({detectWeather,detectAirQuality,dailySummaryCandidate})',{Intl,Date,URL,URLSearchParams});
const location={city_id:'1302603',city_name:'Manaus',uf:'AM',latitude:-3.1,longitude:-60,timezone:'America/Manaus'};
const now=new Date('2026-10-01T11:00Z'),at=now.getTime()/1000;
function weather(){return {current:{time:at,temperature_2m:30,apparent_temperature:32,precipitation:0,weather_code:2,wind_gusts_10m:20},hourly:{time:Array.from({length:7},(_,i)=>at+i*3600),temperature_2m:Array(7).fill(30),precipitation:Array(7).fill(0),precipitation_probability:Array(7).fill(0),weather_code:Array(7).fill(2),wind_gusts_10m:Array(7).fill(20)},daily:{time:[Date.parse('2026-10-01T00:00-04:00')/1000],temperature_2m_max:[34],temperature_2m_min:[25],precipitation_probability_max:[40]}};}
test('campos ausentes, strings e booleans não fabricam uma mudança térmica',()=>{
  for(const missing of [null,undefined,'0',false]){
    const data=weather();data.current.temperature_2m=missing;
    assert.equal(pure.detectWeather(data,location,now).some(e=>e.type==='weather_change'),false);
  }
});
test('início de chuva e aumento de vento exigem observação atual válida',()=>{
  const data=weather();data.current.precipitation=null;data.current.wind_gusts_10m=null;
  data.hourly.precipitation[1]=1;data.hourly.precipitation_probability[1]=70;data.hourly.wind_gusts_10m[4]=55;
  const events=pure.detectWeather(data,location,now);
  assert.equal(events.some(e=>e.type==='rain_approaching'||e.type==='weather_change'),false);
});
test('probabilidade alta em outra hora não transforma volume improvável em chuva forte',()=>{
  const data=weather();data.hourly.precipitation[1]=12;data.hourly.precipitation_probability[1]=10;data.hourly.precipitation_probability[2]=90;
  assert.equal(pure.detectWeather(data,location,now).some(e=>e.type==='heavy_rain'),false);
  data.hourly.precipitation_probability[1]=80;
  assert.equal(pure.detectWeather(data,location,now).find(e=>e.type==='heavy_rain').severity,3);
});
test('horizontes usam tempo real; séries com lacunas ou fora de ordem não inventam intervalos',()=>{
  const data=weather();data.hourly.time[1]=at+4*3600;data.hourly.time=data.hourly.time.slice(0,2);data.hourly.precipitation[1]=50;data.hourly.precipitation_probability[1]=99;
  assert.equal(pure.detectWeather(data,location,now).length,0);
  const unordered=weather();unordered.hourly.time[2]=unordered.hourly.time[1];unordered.hourly.weather_code[2]=99;
  assert.equal(pure.detectWeather(unordered,location,now).length,0);
  const midnight=new Date('2026-10-01T23:59-04:00'),forecast=weather();forecast.current.time=midnight.getTime()/1000;
  forecast.hourly.time=Array.from({length:7},(_,i)=>Date.parse('2026-10-01T23:00-04:00')/1000+i*3600);
  forecast.hourly.precipitation[1]=1;forecast.hourly.precipitation_probability[1]=80;
  assert.match(pure.detectWeather(forecast,location,midnight).find(e=>e.type==='rain_approaching').body,/23:00 e 00:00/);
});
test('calor com sensação ausente usa temperatura, sem inventar sensação de zero graus',()=>{
  const data=weather();data.current.apparent_temperature=null;data.current.temperature_2m=41;
  const event=pure.detectWeather(data,location,now).find(e=>e.type==='extreme_heat');
  assert.match(event.body,/temperatura.*41 °C/);assert.doesNotMatch(event.body,/sensação/);
});
test('leituras antigas, futuras ou sem timestamp não criam push meteorológico ou AQI',()=>{
  for(const time of [null,at-5401,at+901,'1790860500']){
    const data=weather();data.current.time=time;data.current.temperature_2m=43;
    assert.equal(pure.detectWeather(data,location,now).length,0);
    assert.equal(pure.detectAirQuality({current:{time,us_aqi:180}},location,now),null);
  }
  const air=pure.detectAirQuality({current:{time:at,us_aqi:180,pm2_5:null}},location,now);
  assert.equal(air.metadata.pm2_5,null);assert.equal(air.severity,3);
  assert.equal(pure.detectAirQuality({current:{time:at,us_aqi:'180'}},location,now),null);
});
test('resumo escolhe o dia municipal correto e exige extremos e probabilidade reais',()=>{
  const data=weather(),preference={daily_summary:true,daily_summary_time:'07:00'};
  for(const field of ['temperature_2m_max','temperature_2m_min','precipitation_probability_max']){
    const missing=structuredClone(data);missing.daily[field][0]=null;
    assert.equal(pure.dailySummaryCandidate(missing,location,preference,now),null);
  }
  data.daily.time.unshift(at-86400);data.daily.temperature_2m_max.unshift(1);data.daily.temperature_2m_min.unshift(0);data.daily.precipitation_probability_max.unshift(0);
  assert.match(pure.dailySummaryCandidate(data,location,preference,now).body,/34 °C.*25 °C.*40%/);
});

function worker({count=205,failWeather=false}={}){
  let handler,cursor=null,lease=null,clock=now.getTime(),fetches=0,failAccounts=false;
  const rows=Array.from({length:count},(_,i)=>({...location,id:String(i+1).padStart(6,'0'),user_id:'owner'}));
  const state={completed:[],delivered:[],failAt:null,budgetAt:null};
  const admin={async rpc(name,args){
    if(name==='pluvia_push_claim'){if(lease)return {data:[]};lease=args.p_token;return {data:[{cursor_id:cursor}]};}
    if(args.p_token!==lease)return {data:false};
    if(state.failAt!==null&&args.p_cursor===state.failAt&&!args.p_release)return {error:{code:'unavailable'}};
    cursor=args.p_cursor;if(args.p_release)lease=null;else state.completed.push(cursor);return {data:true};
  },from(table){
    let after=null;const chain={select(){return chain;},eq(){return chain;},in(){return chain;},order(){return chain;},limit(){return chain;},gt(key,value){after=value;return chain;},delete(){return chain;},lt(){return chain;},then(resolve){return Promise.resolve(failAccounts&&table==='notification_preferences'?{error:{code:'network'}}:{data:table==='notification_locations'?rows.filter(r=>!after||r.id>after).slice(0,100):table==='notification_preferences'?[{user_id:'owner',notifications_enabled:true,official_alerts:true,heavy_rain:true,air_quality:true}]:table==='push_subscriptions'?[{id:'subscription',user_id:'owner'}]:[]}).then(resolve);}};return chain;
  }};
  const ctx=vm.createContext({Deno:{serve:fn=>handler=fn},crypto:require('node:crypto').webcrypto,adminClient:()=>admin,pushSecrets:async()=>({cron_secret:'secret'}),readJson:async()=>({action:'process'}),json:(req,body,status=200)=>({body,status}),preflight(){},selectCandidates:x=>x,TextEncoder,URL,URLSearchParams,Intl,Date:class extends Date{constructor(value){super(value??clock);}static now(){return clock;}},console:{warn(){},error(){}}});
  vm.runInContext(source,ctx);
  ctx.fetchJson=async url=>{fetches++;if(url.includes('inmet'))return [];if(failWeather)throw Error('source_network');return weather();};
  ctx.detectWeather=()=>[];ctx.dailySummaryCandidate=()=>null;ctx.detectAirQuality=()=>null;
  ctx.inmetForLocation=(alerts,row)=>{if(state.budgetAt===row.id)clock+=90001;return [{type:'official_alert',severity:3}];};
  ctx.createEvent=async(admin,row,candidate)=>({...candidate,created:true,rowId:row.id});
  ctx.deliver=async(admin,event)=>{state.delivered.push(event.rowId);return {accepted:1};};
  return {state,run:()=>handler({method:'POST',headers:{get:()=> 'secret'}}),get fetches(){return fetches;},get cursor(){return cursor;},get leased(){return !!lease;},set failAccounts(value){failAccounts=value;},hold(){lease='other';}};
}
test('três execuções percorrem 205 locais e a seguinte volta ao início; consultas iguais são deduplicadas',async()=>{
  const w=worker();
  for(const count of [100,100,5]){const r=await w.run();assert.equal(r.status,200);assert.equal(r.body.locations,count);}
  assert.equal(new Set(w.state.delivered).size,205);assert.equal(w.fetches,9,'INMET, previsão e AQI: uma consulta por fonte/URL em cada execução');
  const next=await w.run();assert.equal(next.body.locations,100);assert.equal(w.cursor,'000100');assert.equal(w.leased,false);
});
test('execução concorrente não consulta fontes nem envia; falha de conta preserva cursor',async()=>{
  const busy=worker();busy.hold();const r=await busy.run();assert.equal(r.body.busy,true);assert.equal(busy.fetches,0);
  const failed=worker();failed.failAccounts=true;assert.equal((await failed.run()).status,503);assert.equal(failed.cursor,null);assert.equal(failed.leased,false);
});
test('limite de tempo mantém o local incompleto para retomada; checkpoint falho não salta adiante',async()=>{
  const w=worker({count:4});w.state.budgetAt='000003';
  const r=await w.run();assert.equal(r.body.budgetExhausted,true);assert.equal(r.body.locations,2);assert.equal(w.cursor,'000002');assert.equal(w.leased,false);
  const failed=worker({count:4});failed.state.failAt='000002';assert.equal((await failed.run()).status,503);assert.equal(failed.cursor,'000001');assert.equal(failed.leased,false);
});
test('falha meteorológica é compartilhada e não bloqueia avisos oficiais',async()=>{
  const w=worker({count:4,failWeather:true}),r=await w.run();
  assert.equal(r.status,200);assert.equal(r.body.sourceFailures,4);assert.equal(w.state.delivered.length,4);assert.equal(w.fetches,3);
});
test('envio interrompido conserva a contagem parcial e não inicia outro dispositivo',async()=>{
  let clock=0,sent=0;
  const admin={from(){const chain={select(){return chain;},eq(){return chain;},in(){return chain;},gte(){return chain;},insert(){return chain;},update(){return chain;},single(){return chain;},then(resolve){return Promise.resolve({data:{id:'delivery'}}).then(resolve);}};return chain;}};
  const context=vm.createContext({Date:class extends Date{static now(){return clock;}},Intl,TextEncoder,URL,URLSearchParams,isRepeat:()=>false,sendWebPush:async()=>{sent++;clock=100;}});
  vm.runInContext(source.slice(0,source.indexOf('Deno.serve(')),context);
  const result=await context.deliver(admin,{type:'official_alert',severity:3,id:'event',url:'./#alertas',fingerprint:'abc',expires:new Date(now.getTime()+3600000)},
    {notifications_enabled:true,official_alerts:true},[{id:'one'},{id:'two'}],'owner',{},50);
  assert.equal(sent,1);assert.equal(result.accepted,1);assert.equal(result.deferred,true);
});
