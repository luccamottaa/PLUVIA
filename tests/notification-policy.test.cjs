const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {selectCandidates,isRepeat}=require('../supabase/functions/_shared/notification-policy.js');
test('um sinal mais forte reúne avisos de chuva relacionados, preservando avisos oficiais',()=>{
 const events=selectCandidates([{type:'rain_approaching',severity:2},{type:'heavy_rain',severity:3},{type:'storm',severity:3},{type:'official_alert',severity:2},{type:'official_alert',severity:3},{type:'extreme_heat',severity:3}]);
 assert.equal(events.length,4);assert.equal(events.filter(e=>['storm','heavy_rain','rain_approaching'].includes(e.type)).length,1);assert.ok(events.some(e=>e.type==='storm'));
});
test('condição repetida por 6h é suprimida sem bloquear aumento de severidade e outras cidades',()=>{
 const now=Date.parse('2026-10-01T00:00Z'), candidate={type:'heavy_rain',severity:3,cityId:'1302603'};
 const previous=[{status:'accepted',sent_at:new Date(now-3600000).toISOString(),notification_events:{event_type:'storm',severity:3,city_id:'1302603'}}];
 assert.equal(isRepeat(candidate,previous,now),true);
 assert.equal(isRepeat({...candidate,severity:4},previous,now),false);
 assert.equal(isRepeat({...candidate,cityId:'3550308'},previous,now),false);
 assert.equal(isRepeat(candidate,previous,now+6*3600000),false);
 assert.equal(isRepeat({type:'official_alert',severity:2,cityId:'1302603'},previous,now),false);
});
test('envio pendente cobre concorrência por dois minutos, falhas não viram sucesso',()=>{
 const now=Date.now(),event={type:'rain_approaching',cityId:'1302603',severity:2};
 const previous={status:'pending',created_at:new Date(now-60000).toISOString(),notification_events:{event_type:'heavy_rain',city_id:'1302603',severity:3}};
 assert.equal(isRepeat(event,[previous],now),true);
 assert.equal(isRepeat(event,[previous],now+120000),false);
 assert.equal(isRepeat(event,[{...previous,status:'failed'}],now),false);
});
test('mensagem de chuva indica previsão, horário no fuso local e números do modelo',()=>{
 const ts=fs.readFileSync('supabase/functions/push-process/index.ts','utf8');
 const js=require('node:module').stripTypeScriptTypes(ts.replace(/^import .*$/gm,''));
 const code=js.slice(0,js.indexOf('Deno.serve'));
 const detect=vm.runInNewContext(code+';detectWeather',{Date,Intl,URL,URLSearchParams,Math,Number});
 const now=new Date('2026-10-01T00:00Z'),t=now.getTime()/1000;
 const events=detect({current:{time:t,precipitation:0,temperature_2m:30},hourly:{time:[t,t+3600,t+7200,t+10800],precipitation:[0,1,2,0],precipitation_probability:[20,70,80,10],weather_code:[0,61,61,0]}},{city_id:'1302603',city_name:'Manaus',timezone:'America/Manaus'},now);
 // 21h and 22h are interval endings: rain covers 20h through 22h locally.
 const rain=events.find(e=>e.type==='rain_approaching');assert.match(rain.body,/20:00.*22:00/);assert.match(rain.body,/80%/);assert.match(rain.body,/2,0 mm\/h/);assert.match(rain.body,/modelo Open-Meteo/);
});
