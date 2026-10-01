const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{stripTypeScriptTypes}=require('node:module');
const frontend=require('../dist/modules/smart-summary.js'),{forecast,city}=require('./support/forecast.cjs');
const edge=fs.readFileSync('supabase/functions/smart-summary/index.ts','utf8');
const summary=vm.runInNewContext(stripTypeScriptTypes(edge.slice(edge.indexOf('const finite ='),edge.indexOf('async function serverHash(')))+';({cleanContext,clientHash})');
test('hash do cliente e da função concordam e dados ausentes não viram zero no servidor',()=>{
 const context=frontend.buildContext(forecast(),null,1,city),clean=summary.cleanContext(context);
 assert.equal(summary.clientHash(clean),frontend.contextHash(context));
 for(const change of [data=>data.next3h.probability=null,data=>data.next6h.precipitation='0',data=>data.next3h.codes.pop(),data=>data.uv=null]) {
  const data=structuredClone(context);change(data);assert.throws(()=>summary.cleanContext(data),/invalid_context/);
 }
});
const push=fs.readFileSync('supabase/functions/push-process/index.ts','utf8');
const purePush=stripTypeScriptTypes(push.replace(/^import .*;\n/gm,''));
const functions=vm.runInNewContext(purePush.slice(0,purePush.indexOf('Deno.serve('))+';({inmetForLocation,weatherUrl,detectWeather})',{URL,URLSearchParams,Intl,Date});
const location={city_id:city.id,city_name:city.name,uf:city.uf,latitude:city.lat,longitude:city.lon,timezone:city.timezone};
const now=new Date('2026-10-01T12:00:00-04:00');
const alert={id:'1',descricao:'Chuvas intensas',geocodes:[city.id],inicio:'2026-10-01T10:00:00-03:00',fim:'2026-10-01T23:00:00-03:00',severidade:'Perigo'};
test('push oficial exige área municipal e validade reais; códigos IBGE são autoritativos',()=>{
 assert.equal(functions.inmetForLocation([alert],location,now).length,1);
 for(const data of [{...alert,fim:null},{...alert,inicio:'bad'},{...alert,geocodes:['9999999'],municipios:'Manaus',uf:'AM'},{...alert,geocodes:[],municipios:'Manaus do Sul',uf:'AM'},{...alert,geocodes:[],municipios:'Manaus',uf:'AC'}]) assert.equal(functions.inmetForLocation([data],location,now).length,0);
 assert.equal(functions.inmetForLocation([{...alert,geocodes:[],municipios:['Manaus'],uf:'AM'}],location,now).length,1);
});
test('push usa calendário municipal e intervalo de chuva que termina no horário da API',()=>{
 assert.equal(new URL(functions.weatherUrl(location)).searchParams.get('timezone'),city.timezone);
 const at=now.getTime()/1000;
 const data={current:{time:at,precipitation:0,weather_code:2,temperature_2m:30,apparent_temperature:32,wind_gusts_10m:20},hourly:{time:Array.from({length:7},(_,i)=>at+i*3600),precipitation:[90,1,2,0,0,0,0],precipitation_probability:[100,70,80,0,0,0,0],weather_code:Array(7).fill(2),wind_gusts_10m:Array(7).fill(20),temperature_2m:Array(7).fill(30)}};
 const events=functions.detectWeather(data,location,now),rain=events.find(event=>event.type==='rain_approaching');
 assert.ok(rain);assert.match(rain.body,/entre 12:00 e 14:00/);assert.equal(rain.metadata.peak_mm_h,2);
 assert.equal(events.some(event=>event.type==='heavy_rain'),false,'chuva que já terminou não cria aviso intenso');
});

const httpSource=stripTypeScriptTypes(fs.readFileSync('supabase/functions/_shared/http.ts','utf8').replace(/export /g,''));
const {readJson}=vm.runInNewContext(httpSource+';({readJson})',{TextDecoder});
test('corpo JSON limita bytes recebidos mesmo sem Content-Length ou com cabeçalho falso',async()=>{
 for(const headers of [{},{'content-length':'1'}]) {
  const req=new Request('https://example.test',{method:'POST',headers,body:JSON.stringify({value:'a'.repeat(24000)})});
  await assert.rejects(readJson(req),/payload_too_large/);
 }
 const req=new Request('https://example.test',{method:'POST',body:JSON.stringify({city:'São Paulo'})});
 assert.equal((await readJson(req)).city,'São Paulo');
});
test('falha da previsão mantém processamento independente dos avisos oficiais',async()=>{
 let handler;const candidates=[],sent=[];
 const row={...location,id:'location',user_id:'owner'};
 const preferences={user_id:'owner',notifications_enabled:true,official_alerts:true};
 const admin={from(table){const chain={select(){return chain;},eq(){return chain;},in(){return chain;},limit(){return chain;},delete(){return chain;},lt(){return chain;},then(resolve){return Promise.resolve({data:table==='notification_locations'?[row]:table==='notification_preferences'?[preferences]:table==='push_subscriptions'?[{id:'subscription',user_id:'owner'}]:[]}).then(resolve);}};return chain;}};
 const current=new Date('2026-10-01T12:00-04:00');
 const ctx=vm.createContext({Deno:{serve:fn=>handler=fn},adminClient:()=>admin,pushSecrets:async()=>({cron_secret:'test'}),readJson:async()=>({action:'process'}),preflight(){},json:(req,body,status=200)=>({body,status}),selectCandidates:values=>values,TextEncoder,URL,URLSearchParams,Intl,Date:class extends Date{constructor(value){super(value??current);}static now(){return current.getTime();}},console:{warn(){},error(){}}});
 vm.runInContext(purePush,ctx);
 ctx.fetchJson=async url=>{if(url.includes('inmet'))return [alert];throw Error('weather offline');};
 ctx.createEvent=async(admin,location,candidate)=>{candidates.push(candidate);return {...candidate,created:true};};
 ctx.deliver=async(admin,event)=>{sent.push(event);return {accepted:1};};
 const response=await handler({method:'POST',headers:{get:()=> 'test'}});
 assert.equal(response.status,200);assert.equal(response.body.sourceFailures,1);assert.equal(candidates.length,1);assert.equal(sent[0].type,'official_alert');
});
