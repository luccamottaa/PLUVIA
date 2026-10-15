const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/push-process/index.ts','utf8').replace(/^import .*;\n/gm,''));
const pure=vm.runInNewContext(source.slice(0,source.indexOf('Deno.serve('))+';({detectWeather,detectAirQuality,dailySummaryCandidate,eveningSummaryCandidate,detectObserved})',{Intl,Date,URL,URLSearchParams});
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
test('resumo da noite usa o amanhã municipal, o horário escolhido e não inventa chuva',()=>{
  // 20:00 em Manaus (UTC-4): o dia de hoje ainda vem na previsão e não pode virar "amanhã".
  const evening=new Date('2026-10-02T00:00Z'),t=evening.getTime()/1000;
  const data=()=>{const d=weather();d.current.time=t;d.daily={time:[Date.parse('2026-10-01T00:00-04:00')/1000,Date.parse('2026-10-02T00:00-04:00')/1000],
    temperature_2m_max:[34,31.6],temperature_2m_min:[25,23.4],precipitation_probability_max:[10,70],precipitation_sum:[0,6.4]};return d;};
  const preference={evening_summary:true,evening_summary_time:'20:00'};
  const event=pure.eveningSummaryCandidate(data(),location,preference,evening);
  assert.equal(event.type,'evening_summary');assert.equal(event.metadata.day,'2026-10-02');
  assert.match(event.title,/Manaus amanhã/);assert.match(event.body,/^Leve guarda-chuva: até 70% de chance de chuva \(6 mm\)\. Máxima de 32 °C e mínima de 23 °C\.$/);
  assert.equal(event.fingerprintSeed,'evening_summary|1302603|2026-10-02');
  // Chance alta com volume abaixo de 1 mm não pede guarda-chuva nem mostra "0 mm".
  const drizzle=data();drizzle.daily.precipitation_sum[1]=0.3;
  assert.equal(pure.eveningSummaryCandidate(drizzle,location,preference,evening).body,'Máxima de 32 °C, mínima de 23 °C e até 70% de chance de chuva.');
  // Sem a soma de chuva, a chance continua valendo sozinha.
  const noSum=data();delete noSum.daily.precipitation_sum;
  assert.match(pure.eveningSummaryCandidate(noSum,location,preference,evening).body,/^Leve guarda-chuva: até 70% de chance de chuva\. /);
  assert.equal(pure.eveningSummaryCandidate(data(),location,{evening_summary:false,evening_summary_time:'20:00'},evening),null);
  assert.equal(pure.eveningSummaryCandidate(data(),location,{evening_summary:true,evening_summary_time:'21:00'},evening),null);
  assert.ok(pure.eveningSummaryCandidate(data(),location,{evening_summary:true,evening_summary_time:'19:57'},evening));
  for(const field of ['temperature_2m_max','temperature_2m_min','precipitation_probability_max']){
    const missing=data();missing.daily[field][1]=null;
    assert.equal(pure.eveningSummaryCandidate(missing,location,preference,evening),null);
  }
  const inverted=data();inverted.daily.temperature_2m_min[1]=40;
  assert.equal(pure.eveningSummaryCandidate(inverted,location,preference,evening),null);
  const onlyToday=data();for(const key of Object.keys(onlyToday.daily)) onlyToday.daily[key]=onlyToday.daily[key].slice(0,1);
  assert.equal(pure.eveningSummaryCandidate(onlyToday,location,preference,evening),null);
  const stale=data();stale.current.time=t-5401;
  assert.equal(pure.eveningSummaryCandidate(stale,location,preference,evening),null);
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
  const ctx=vm.createContext({Deno:{serve:fn=>handler=fn},crypto:require('node:crypto').webcrypto,adminClient:()=>admin,pushSecrets:async()=>({cron_secret:'secret'}),readJson:async()=>({action:'process'}),json:(req,body,status=200)=>({body,status}),preflight(){},selectCandidates:x=>x,report:()=>{},TextEncoder,URL,URLSearchParams,Intl,Date:class extends Date{constructor(value){super(value??clock);}static now(){return clock;}},console:{warn(){},error(){}}});
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

test('chuva e trovoada observadas: estação começa a medir, aeroporto relata trovoada ou chuva por perto',()=>{
  const now=new Date('2026-10-13T16:20:00Z');
  const station=(rainMm,previousRainMm,time='2026-10-13T16:00:00Z')=>({station:{ibge:'1302603',distanceKm:1.9},time,rainMm,previousRainMm});
  const airport=(weather,previous={rain:null},time='2026-10-13T16:00:00Z')=>({icao:'SBEG',distanceKm:9.5,time,weather:{rain:null,showers:false,drizzle:false,thunder:false,nearbyShowers:false,nearbyThunder:false,...weather},previous:{weather:previous}});
  // Estação: 5,0 mm na hora que fechou, hora anterior seca.
  const started=pure.detectObserved({station:station(5,0),airport:null},location,now);
  assert.equal(started.length,1);
  assert.equal(started[0].type,'rain_now');
  assert.equal(started[0].body,'A estação do INMET mais próxima de Manaus mediu 5,0 mm entre 11:00 e 12:00.');
  assert.doesNotMatch(started[0].body,/modelo/);
  // Já chovia na hora anterior: não é começo; menos de 1 mm ou leitura velha também não.
  assert.equal(pure.detectObserved({station:station(5,2.4),airport:null},location,now).length,0);
  assert.equal(pure.detectObserved({station:station(0.6,0),airport:null},location,now).length,0);
  assert.equal(pure.detectObserved({station:station(5,0,'2026-10-13T15:00:00Z'),airport:null},location,now).length,0);
  // Aeroporto: TSRA (SPECI de 01:18 em Manaus) vira trovoada agora, severidade 3.
  const night=new Date('2026-10-13T05:25:00Z');
  const storm=pure.detectObserved({station:null,airport:airport({thunder:true,rain:'moderate'},{nearbyThunder:true},'2026-10-13T05:18:00Z')},location,night);
  assert.equal(storm[0].type,'storm_now');
  assert.equal(storm[0].severity,3);
  assert.equal(storm[0].body,'O aeroporto mais próximo (SBEG, a 10 km) relatou trovoada com chuva perto de Manaus às 01:18. Procure abrigo e evite áreas abertas.');
  // Chuva no aeroporto depois de um boletim seco: começou a chover.
  const shra=pure.detectObserved({station:null,airport:airport({rain:'moderate',showers:true})},location,now);
  assert.equal(shra[0].type,'rain_now');
  assert.match(shra[0].body,/relatou pancadas de chuva perto de Manaus às 12:00/);
  assert.equal(pure.detectObserved({station:null,airport:airport({rain:'moderate'},{rain:'light'})},location,now).length,0,'já chovia no boletim anterior');
  // Nas proximidades (VCTS), sem chuva no aeroporto nem na estação: chuva por perto.
  const close=pure.detectObserved({station:station(0,0),airport:airport({nearbyThunder:true,nearbyShowers:true})},location,now);
  assert.equal(close.length,1);
  assert.equal(close[0].type,'rain_nearby');
  assert.equal(close[0].title,'🌦️ Trovoada por perto');
  assert.equal(close[0].body,'O aeroporto mais próximo (SBEG, a 10 km) relatou trovoada nas proximidades às 12:00. A chuva pode chegar a Manaus em breve.');
  // Boletim velho ou ausente não gera nada.
  assert.equal(pure.detectObserved({station:null,airport:airport({thunder:true},{},'2026-10-13T14:30:00Z')},location,now).length,0);
  assert.equal(pure.detectObserved({station:null,airport:null},location,now).length,0);
});

// Notificações mais específicas (outubro/2026): o ciclo normal do dia não é "mudança no tempo",
// os resumos dizem quando a chuva é mais provável e "chuva nas próximas horas" cala enquanto chove.
const smart=vm.runInNewContext(source.slice(0,source.indexOf('Deno.serve('))+';({detectWeather,dailySummaryCandidate,eveningSummaryCandidate,rainingNow,weatherUrl})',{Intl,Date,URL,URLSearchParams});
// 30 horas: 24 de ontem + agora + 6 à frente. Ciclo do dia de Manaus: 24 °C de madrugada, 32 °C à tarde.
function day({shift=0,start='2026-10-01T05:00-04:00'}={}){
  const t0=Date.parse(start)/1000,times=Array.from({length:31},(_,i)=>t0+(i-24)*3600);
  const cycle=time=>{const h=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Manaus',hour:'2-digit',hourCycle:'h23'}).format(new Date(time*1000)));return 28-4*Math.cos((h-3)/24*2*Math.PI);};
  return {now:new Date(t0*1000),data:{current:{time:t0,temperature_2m:cycle(t0),apparent_temperature:cycle(t0),precipitation:0,weather_code:1,wind_gusts_10m:15},
    hourly:{time:times,temperature_2m:times.map(t=>cycle(t)+(t>t0?shift:0)),precipitation:times.map(()=>0),precipitation_probability:times.map(()=>0),weather_code:times.map(()=>1),wind_gusts_10m:times.map(()=>15)}}};
}
test('ciclo normal do dia não vira "mudança no tempo"; massa de ar diferente de ontem vira, no máximo uma vez por dia',()=>{
  for(const start of ['2026-10-01T05:00-04:00','2026-10-01T13:00-04:00']){
    const {now,data}=day({start});
    assert.equal(smart.detectWeather(data,location,now).some(e=>e.type==='weather_change'),false,start);
  }
  const cold=day({shift:-7});
  const event=smart.detectWeather(cold.data,location,cold.now).find(e=>e.type==='weather_change');
  assert.equal(event.title,'🌡️ Mais frio que ontem');
  assert.equal(event.body,'Nas próximas horas em Manaus: cerca de 7 °C a menos que ontem no mesmo horário.');
  assert.equal(event.fingerprintSeed,'weather_change|1302603|2026-10-01|colder');
  const later=day({shift:-7,start:'2026-10-01T13:00-04:00'});
  assert.equal(smart.detectWeather(later.data,location,later.now).find(e=>e.type==='weather_change').fingerprintSeed,event.fingerprintSeed,'mesmo dia, mesmo aviso');
  // Ontem incompleto (menos de 4 pares) não fabrica diferença.
  const gap=day({shift:-9});gap.data.hourly.temperature_2m=gap.data.hourly.temperature_2m.map((v,i)=>i<27?null:v);
  assert.equal(smart.detectWeather(gap.data,location,gap.now).some(e=>e.type==='weather_change'),false);
});
test('chuva mais tarde e rajadas dizem a partir de quando',()=>{
  const {now,data}=day();data.hourly.precipitation[29]=2;data.hourly.precipitation_probability[29]=70;data.hourly.wind_gusts_10m[30]=62;
  const event=smart.detectWeather(data,location,now).find(e=>e.type==='weather_change');
  assert.equal(event.body,'Nas próximas horas em Manaus: chuva a partir das 09:00 e rajadas de até 62 km/h a partir das 10:00.');
});
test('chuva forte e trovoada dizem horário e volume',()=>{
  const {now,data}=day();
  data.hourly.precipitation[26]=9;data.hourly.precipitation_probability[26]=80;data.hourly.weather_code[27]=95;
  const events=smart.detectWeather(data,location,now);
  assert.equal(events.find(e=>e.type==='heavy_rain').body,'Chuva forte entre 06:00 e 07:00 em Manaus, até 9 mm em uma hora. Evite áreas alagáveis e acompanhe os avisos oficiais.');
  assert.equal(events.find(e=>e.type==='storm').body,'Sinal de trovoada a partir das 07:00 em Manaus. Raios, chuva intensa e rajadas podem ocorrer.');
  assert.equal(events.find(e=>e.type==='rain_approaching').body,'Chuva forte entre 06:00 e 07:00 em Manaus, com até 80% de chance. Vale levar guarda-chuva.');
});
// Um dia inteiro (00:00–24:00 de Manaus) mais as horas de amanhã, para os resumos.
function forecastDays(start='2026-10-01T07:00-04:00'){
  const t0=Date.parse(start)/1000,first=Date.parse('2026-10-01T01:00-04:00')/1000;
  const times=Array.from({length:48},(_,i)=>first+i*3600);
  return {now:new Date(t0*1000),data:{current:{time:t0,temperature_2m:25,apparent_temperature:27,precipitation:0,weather_code:1,wind_gusts_10m:15},
    hourly:{time:times,temperature_2m:times.map(()=>28),precipitation:times.map(()=>0),precipitation_probability:times.map(()=>5),weather_code:times.map(()=>1),wind_gusts_10m:times.map(()=>15)},
    daily:{time:[Date.parse('2026-10-01T00:00-04:00')/1000,Date.parse('2026-10-02T00:00-04:00')/1000],temperature_2m_max:[33.4,31.6],temperature_2m_min:[24.6,23.4],precipitation_probability_max:[60,70],precipitation_sum:[4,6.4]}}};
}
test('resumo da manhã diz quando a chuva é mais provável, e só afirma dia seco com o dia todo coberto',()=>{
  const preference={daily_summary:true,daily_summary_time:'07:00'};
  const {now,data}=forecastDays();
  // Horas 15:00 e 16:00 (intervalos 14–15 e 15–16) com 40% e 60%.
  const at=h=>data.hourly.time.indexOf(Date.parse(`2026-10-01T${h}:00-04:00`)/1000);
  data.hourly.precipitation_probability[at(15)]=40;data.hourly.precipitation_probability[at(16)]=60;
  assert.equal(smart.dailySummaryCandidate(data,location,preference,now).body,'Máxima de 33 °C e mínima de 25 °C. Chuva mais provável entre 14:00 e 16:00 (até 60%).');
  data.hourly.precipitation_probability[at(16)]=40;
  assert.equal(smart.dailySummaryCandidate(data,location,preference,now).body,'Máxima de 33 °C e mínima de 25 °C. Pode chover entre 14:00 e 16:00 (até 40%).');
  const dry=forecastDays();dry.data.daily.precipitation_probability_max[0]=5;
  assert.equal(smart.dailySummaryCandidate(dry.data,location,preference,dry.now).body,'Máxima de 33 °C e mínima de 25 °C. Sem chuva prevista.');
  // Uma hora sem leitura: não dá para dizer "sem chuva"; volta ao texto da chance máxima.
  const hole=forecastDays();hole.data.daily.precipitation_probability_max[0]=5;hole.data.hourly.precipitation_probability[at(20)]=null;
  assert.equal(smart.dailySummaryCandidate(hole.data,location,preference,hole.now).body,'Máxima de 33 °C, mínima de 25 °C e até 5% de chance de chuva.');
});
test('resumo da noite usa as horas de amanhã para o horário da chuva',()=>{
  const evening=new Date('2026-10-02T00:00Z'),{data}=forecastDays();data.current.time=evening.getTime()/1000;
  const at=h=>data.hourly.time.indexOf(Date.parse(`2026-10-02T${h}:00-04:00`)/1000);
  for(const h of ['13','14','15']) data.hourly.precipitation_probability[at(h)]=70;
  const body=smart.eveningSummaryCandidate(data,location,{evening_summary:true,evening_summary_time:'20:00'},evening).body;
  // Série de 48 horas (01:00 de hoje até 00:00 do dia 3): o amanhã inteiro está coberto.
  assert.equal(body,'Leve guarda-chuva. Máxima de 32 °C e mínima de 23 °C. Chuva mais provável entre 12:00 e 15:00 (até 70%). Total previsto: 6 mm.');
});
test('chovendo agora pela estação ou pelo aeroporto; leitura velha não conta',()=>{
  const now=new Date('2026-10-13T16:20:00Z');
  assert.equal(smart.rainingNow({station:{station:{},time:'2026-10-13T16:00:00Z',rainMm:0.4},airport:null},now),true);
  assert.equal(smart.rainingNow({station:{station:{},time:'2026-10-13T15:00:00Z',rainMm:4},airport:null},now),false);
  assert.equal(smart.rainingNow({station:null,airport:{time:'2026-10-13T16:00:00Z',weather:{rain:'light'}}},now),true);
  assert.equal(smart.rainingNow({station:{station:{},time:'2026-10-13T16:00:00Z',rainMm:0},airport:{time:'2026-10-13T16:00:00Z',weather:{nearbyShowers:true}}},now),false);
  assert.equal(smart.rainingNow({station:null,airport:null},now),false);
});
test('consulta do push traz as 24 horas de ontem e três dias',()=>{
  const url=new URL(smart.weatherUrl({...location,id:'x',user_id:'u'}));
  assert.equal(url.searchParams.get('past_hours'),'24');assert.equal(url.searchParams.get('forecast_days'),'3');
});
