const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {selectCandidates,isRepeat,pushUrgency,activeSubscriptions,isOfficialRepeat}=require('../supabase/functions/_shared/notification-policy.js');
const processor=fs.readFileSync('supabase/functions/push-process/index.ts','utf8');
const worker=require('node:module').stripTypeScriptTypes(processor.replace(/^import .*$/gm,''));
const quiet=vm.runInNewContext(worker.slice(0,worker.indexOf('Deno.serve'))+';inQuietHours',{Date,Intl,URL,URLSearchParams,Math,Number});
test('silêncio cruza meia-noite, inclui início e exclui fim no fuso configurado',()=>{
 const pref={quiet_start:'22:00:00',quiet_end:'07:00:00',timezone:'America/Manaus'};
 for(const [stamp,expected] of [['2026-10-03T21:59-04:00',false],['2026-10-03T22:00-04:00',true],['2026-10-04T00:00-04:00',true],['2026-10-04T06:59-04:00',true],['2026-10-04T07:00-04:00',false]]) assert.equal(quiet(pref,3,new Date(stamp)),expected,stamp);
 assert.equal(quiet(pref,4,new Date('2026-10-04T02:00-04:00')),false);
 assert.equal(quiet({...pref,quiet_start:null,quiet_end:null},3,new Date('2026-10-04T02:00-04:00')),false);
});
test('silêncio diurno e DST usam horas municipais, não o fuso do dispositivo',()=>{
 const pref={quiet_start:'12:00',quiet_end:'15:00',timezone:'America/Manaus'};
 assert.equal(quiet(pref,2,new Date('2026-10-03T16:00Z')),true);assert.equal(quiet(pref,2,new Date('2026-10-03T19:00Z')),false);
 const ny={quiet_start:'01:00',quiet_end:'02:00',timezone:'America/New_York'};
 assert.equal(quiet(ny,3,new Date('2026-11-01T05:30Z')),true);assert.equal(quiet(ny,3,new Date('2026-11-01T06:30Z')),true);assert.equal(quiet(ny,3,new Date('2026-11-01T07:00Z')),false);
});
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
 const rain=events.find(e=>e.type==='rain_approaching');assert.match(rain.body,/20:00.*22:00/);assert.match(rain.body,/80%/);assert.match(rain.body,/^Chuva fraca /);
 // A identificação de modelo vem do estilo no aparelho, uma vez só (o corpo não repete "modelo").
 assert.equal(rain.source,'Open-Meteo · modelo');
 const look=require('../dist/modules/push-style.js').style({type:rain.type,title:rain.title,body:rain.body,source:rain.source,severity:rain.severity});
 assert.match(look.body,/Previsão do modelo; pode mudar\.$/);
});
test('chuva observada não é repetição da previsão, e "chuva por perto" não segura o aviso de quando ela chega',()=>{
 const now=Date.parse('2026-10-13T16:30:00Z'),sent=(type,severity,minutes)=>({status:'accepted',sent_at:new Date(now-minutes*60000).toISOString(),notification_events:{event_type:type,severity,city_id:'1302603'}});
 const rainNow={type:'rain_now',severity:2,cityId:'1302603'};
 assert.equal(isRepeat(rainNow,[sent('rain_approaching',2,90)],now),false,'previsão de 1h30 atrás');
 assert.equal(isRepeat(rainNow,[sent('rain_nearby',2,30)],now),false,'chuva por perto antes');
 assert.equal(isRepeat(rainNow,[sent('rain_now',2,60)],now),true,'mesmo episódio');
 assert.equal(isRepeat({type:'storm_now',severity:3,cityId:'1302603'},[sent('rain_now',2,20)],now),false,'trovoada sobe a severidade');
 const picked=selectCandidates([{type:'rain_now',severity:2},{type:'storm_now',severity:3},{type:'rain_approaching',severity:2},{type:'rain_nearby',severity:2}]);
 // Já chovendo, "chuva nas próximas horas" sai do lote.
 assert.deepEqual(picked.map(c=>c.type).sort(),['rain_nearby','storm_now']);
});
test('chuva medida agora (sem aviso de "começou") também cala "chuva nas próximas horas"',()=>{
 const batch=[{type:'rain_approaching',severity:2},{type:'heavy_rain',severity:3},{type:'extreme_heat',severity:3}];
 assert.deepEqual(selectCandidates(batch,{raining:true}).map(c=>c.type).sort(),['extreme_heat','heavy_rain']);
 assert.deepEqual(selectCandidates([{type:'rain_approaching',severity:2}],{raining:true}),[]);
 assert.deepEqual(selectCandidates([{type:'rain_approaching',severity:2}]).map(c=>c.type),['rain_approaching']);
});
test('resumo marcado e chuva que começou saem com prioridade alta; mudança no tempo continua normal',()=>{
 for(const type of ['daily_summary','evening_summary','rain_now','storm_now','rain_nearby']) assert.equal(pushUrgency(type,1),'high',type);
 assert.equal(pushUrgency('weather_change',2),'normal');assert.equal(pushUrgency('official_alert',2),'normal');
 assert.equal(pushUrgency('official_alert',3),'high');assert.equal(pushUrgency('heavy_rain',3),'high');
});
test('"parou de chover" só depois de um "começou" entregue e nunca junto de chuva',()=>{
 const {stopAllowed}=require('../supabase/functions/_shared/notification-policy.js');
 const d=(type,at,status='accepted',observed)=>({status,sent_at:new Date(at).toISOString(),notification_events:{event_type:type,city_id:'1302603',severity:2,metadata:observed?{observed_at:new Date(observed).toISOString()}:{}}});
 const H=3600000, now=10*H, opts={now};
 assert.equal(stopAllowed([],opts),false);
 assert.equal(stopAllowed([d('rain_approaching',1000)],opts),false,'previsão não basta');
 assert.equal(stopAllowed([d('rain_now',1000)],opts),true);
 assert.equal(stopAllowed([d('storm_now',1000)],opts),true);
 assert.equal(stopAllowed([d('rain_now',1000),d('rain_stopped',2000)],opts),false,'já avisou que parou');
 assert.equal(stopAllowed([d('rain_now',1000),d('rain_stopped',2000),d('rain_now',3000)],opts),true,'voltou a chover e parou de novo');
 assert.equal(stopAllowed([d('rain_now',1000,'failed')],opts),false);
 // Rio, 23/10/2026: "começou" às 11:00 e "parou" às 11:05. Pancada curta não ganha "parou".
 assert.equal(stopAllowed([d('rain_now',now-5*60000)],opts),false,'menos de 1 h depois do começou');
 assert.equal(stopAllowed([d('rain_now',now-H)],opts),true);
 // 25/10/2026: a estação mediu chuva até 23:00 (aviso às 23:20); o boletim das 23:00 do aeroporto não diz que parou depois disso.
 assert.equal(stopAllowed([d('rain_now',now-H,'accepted',now-2*H)],{now,observedAt:new Date(now-2*H).toISOString()}),false,'leitura do parou não é posterior');
 assert.equal(stopAllowed([d('rain_now',now-H,'accepted',now-2*H)],{now,observedAt:new Date(now-H).toISOString()}),true);
 const picked=selectCandidates([{type:'rain_stopped',severity:1},{type:'rain_now',severity:2}]);
 assert.deepEqual(picked.map(e=>e.type),['rain_now']);
 assert.deepEqual(selectCandidates([{type:'rain_stopped',severity:1}],{raining:true}),[]);
 assert.equal(pushUrgency('rain_stopped',1),'high');
});
test('chuva chegando substitui "chuva nas próximas horas" e some quando já chove',()=>{
 assert.deepEqual(selectCandidates([{type:'rain_approaching',severity:2},{type:'rain_incoming',severity:2}]).map(e=>e.type),['rain_incoming']);
 assert.deepEqual(selectCandidates([{type:'rain_incoming',severity:2}],{raining:true}),[]);
 assert.deepEqual(selectCandidates([{type:'rain_incoming',severity:2},{type:'rain_now',severity:2}]).map(e=>e.type),['rain_now']);
 assert.equal(pushUrgency('rain_incoming',2),'high');
});
test('reinstalar o app no mesmo aparelho não duplica avisos; outro aparelho em uso continua recebendo',()=>{
 const apple='https://web.push.apple.com/abc', ios={platform:'iOS/iPadOS',browser:'Safari'};
 // 19/10/2026: inscrição antiga (vista pela última vez às 02:17) e a nova do app reinstalado às 03:09.
 const old={id:'old',endpoint:apple,...ios,created_at:'2026-10-14T04:32Z',last_seen_at:'2026-10-20T02:17Z'};
 const fresh={id:'new',endpoint:apple+'2',...ios,created_at:'2026-10-20T03:09Z',last_seen_at:'2026-10-20T03:09Z'};
 const windows={id:'pc',endpoint:'https://fcm.googleapis.com/x',platform:'Windows',browser:'Chrome',created_at:'2026-10-01T20:36Z',last_seen_at:'2026-10-17T00:38Z'};
 assert.deepEqual(activeSubscriptions([old,fresh,windows]).map(item=>item.id),['new','pc']);
 // Um iPad aberto depois que o iPhone se inscreveu é outro aparelho em uso: os dois recebem.
 const ipad={...old,id:'ipad',last_seen_at:'2026-10-20T04:00Z'};
 assert.deepEqual(activeSubscriptions([ipad,fresh]).map(item=>item.id).sort(),['ipad','new']);
 assert.deepEqual(activeSubscriptions([fresh]).map(item=>item.id),['new']);
 assert.deepEqual(activeSubscriptions([]),[]);
});
test('aviso do INMET que ainda vai começar diz quando começa, sem parecer valer agora',()=>{
 const inmet=vm.runInNewContext(worker.slice(0,worker.indexOf('Deno.serve'))+';inmetForLocation',{Date,Intl,URL,URLSearchParams,Math,Number,JSON,String,Array,Object,Set,Map,RegExp});
 const location={city_id:'1302603',city_name:'Manaus',uf:'AM',timezone:'America/Manaus'};
 const alert={id:'a1',geocodes:['1302603'],descricao:'Chuvas Intensas',severidade:'Perigo Potencial',riscos:'Baixo risco de alagamentos.',inicio:'2026-10-21T03:01:00Z',fim:'2026-10-22T02:59:00Z'};
 const now=new Date('2026-10-20T03:05Z'); // 23:05 de 19/10 em Manaus
 const [future]=inmet([alert],location,now);
 assert.match(future.body,/^Perigo potencial previsto em Manaus, AM, de amanhã às 23:01 até qua\., 21\/10 às 22:59\. /);
 const [active]=inmet([{...alert,inicio:'2026-10-20T02:00:00Z',fim:'2026-10-20T05:00:00Z'}],location,now);
 assert.match(active.body,/^Perigo potencial em Manaus, AM, válido até \w+ às 01:00\. |^Perigo potencial em Manaus, AM, válido até amanhã às 01:00\. /);
});
test('aviso do INMET republicado com outro número não chega de novo; grau maior ou fim novo chegam',()=>{
 const sent={notification_events:{event_type:'official_alert',severity:2,title:'⚠️ Chuvas Intensas',metadata:{official_id:'a1',valid_until:'2026-10-21T02:59:00.000Z'}}};
 const again={type:'official_alert',severity:2,title:'⚠️ Chuvas Intensas',metadata:{official_id:'a2',valid_until:'2026-10-21T02:59:00.000Z'}};
 assert.equal(isOfficialRepeat(again,[sent]),true);
 assert.equal(isOfficialRepeat({...again,severity:3},[sent]),false,'grau maior avisa');
 assert.equal(isOfficialRepeat({...again,metadata:{valid_until:'2026-10-22T02:59:00.000Z'}},[sent]),false,'aviso do dia seguinte avisa');
 assert.equal(isOfficialRepeat({...again,title:'⚠️ Acumulado de Chuva'},[sent]),false);
 assert.equal(isOfficialRepeat(again,[]),false);
 // Rio, 24/10/2026: "Perigo" do dia 25 inteiro às 08:10; às 23:00 "Perigo" só da manhã e "Perigo potencial" do dia todo.
 const day={notification_events:{event_type:'official_alert',severity:3,title:'⚠️ Tempestade',started_at:'2026-10-25T03:00:00Z',metadata:{valid_until:'2026-10-26T02:59:00.000Z'}}};
 const morning={type:'official_alert',severity:3,title:'⚠️ Tempestade',start:new Date('2026-10-25T03:00:00Z'),metadata:{valid_until:'2026-10-25T15:00:00.000Z'}};
 const weaker={type:'official_alert',severity:2,title:'⚠️ Tempestade',start:new Date('2026-10-25T03:00:00Z'),metadata:{valid_until:'2026-10-26T02:59:00.000Z'}};
 assert.equal(isOfficialRepeat(morning,[day]),true,'período dentro do já avisado');
 assert.equal(isOfficialRepeat(weaker,[day]),true,'grau menor no mesmo período');
 assert.equal(isOfficialRepeat({...weaker,metadata:{valid_until:'2026-10-27T02:59:00.000Z'}},[day]),false,'vai além do já avisado');
 assert.equal(isOfficialRepeat({...morning,severity:4},[day]),false,'grau maior avisa');
 // No mesmo lote, o mais grave que cobre o outro vai sozinho.
 const batch=[{...weaker,expires:new Date('2026-10-26T02:59:00Z')},{...morning,expires:new Date('2026-10-26T02:59:00Z')}];
 assert.deepEqual(selectCandidates(batch).map(e=>e.severity),[3]);
 const other={...weaker,title:'⚠️ Acumulado de Chuva',expires:new Date('2026-10-26T02:59:00Z')};
 assert.equal(selectCandidates([...batch,other]).length,2,'outro fenômeno continua');
});
