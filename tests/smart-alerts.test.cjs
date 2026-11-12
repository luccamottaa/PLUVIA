// Avisos inteligentes (1.73.6): força e duração pelo radar, "vai engrossar", "o pior já passou", risco de
// alagamento e limite diário dos avisos fracos.
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const policy=require('../supabase/functions/_shared/notification-policy.js');

const processor=fs.readFileSync('supabase/functions/push-process/index.ts','utf8');
const worker=stripTypeScriptTypes(processor.replace(/^import .*$/gm,''));
const api=vm.runInNewContext(worker.slice(0,worker.indexOf('Deno.serve('))+';({nowcastCandidate,worseningCandidate,easingCandidate,floodCandidate,localDayStart})',{Intl,Date,URL,URLSearchParams,Math,Number});
const location={city_id:'1302603',city_name:'Manaus',timezone:'America/Manaus'};
const radar=()=>import('../supabase/functions/_shared/radar-nowcast.js');

// Grade de dBZ com manchas circulares [cx, cy, raio, dBZ] (a última vence onde se sobrepõem).
async function grid(...blobs){
  const {SIZE,DRY}=await radar();const g=new Int8Array(SIZE*SIZE).fill(DRY);
  for(const [cx,cy,r,dbz] of blobs)for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if((x-cx)**2+(y-cy)**2<=r*r)g[y*SIZE+x]=dbz;
  return g;
}

test('cor da telha vira dBZ pela tabela do RainViewer, inclusive com o alfa arredondado',async()=>{
  const r=await radar();
  assert.equal(r.dbzOf(0x88,0xdd,0xee,0xff),15);
  assert.equal(r.dbzOf(0xff,0xd2,0x00,0xff),37);
  assert.equal(r.dbzOf(0xc1,0x00,0x00,0xff),50);
  assert.equal(r.dbzOf(0x76,0x71,0x62,0x34),-4,'como veio numa telha real (75706234 na tabela)');
  assert.equal(r.dbzOf(0xdd,0xd0,0x98,0xbe),14);
  assert.equal(r.dbzOf(0,0,0,0),r.DRY);
  assert.equal(r.category(25),'weak');assert.equal(r.category(30),'moderate');assert.equal(r.category(37),'heavy');assert.equal(r.category(50),'storm');assert.equal(r.category(null),null);
  assert.ok(Math.abs(r.mmPerHour(37)-7.5)<0.6,String(r.mmPerHour(37)));
});

test('grade de dBZ dá a mesma máscara de antes (o "chuva a caminho" não muda)',async()=>{
  const r=await radar();
  const tiles=r.windowTiles(-60.022,-3.119);
  const decoded=tiles.map(({ox,oy})=>{const rgba=new Uint8Array(256*256*4);for(let i=0;i<256*256;i+=7){rgba[i*4]=0xff;rgba[i*4+1]=0xd2;rgba[i*4+3]=i%3?0xff:0x20;}return {ox,oy,rgba};});
  const g=r.windowDbz(decoded);
  assert.deepEqual(r.maskOf(g),r.windowMask(decoded));
  assert.ok(g.some(v=>v===37));
});

test('chuva forte chegando: força e duração pelo movimento da mancha',async()=>{
  const r=await radar(),C=r.CENTER;
  const before=await grid([C-60,C,14,42]),after=await grid([C-44,C,14,42]);
  const arrival=r.estimate(r.maskOf(before),r.maskOf(after),r.SIZE,1200,-3.1);
  const detail=r.incomingDetail(r.outlook(before,after,r.SIZE,1200,-3.1),arrival.minutes);
  assert.equal(detail.intensity,'heavy');assert.equal(detail.peakDbz,42);
  assert.ok(detail.durationMin>=20&&detail.durationMin<=50,String(detail.durationMin));
  assert.equal(detail.open,false);
  const now=new Date('2026-11-12T15:00:00Z');
  const event=api.nowcastCandidate(arrival,now.getTime(),location,now,detail);
  assert.equal(event.title,'🌧️ Chuva forte chegando');assert.equal(event.severity,3);
  assert.match(event.body,new RegExp(`^O radar mostra chuva forte vindo na direção de Manaus: deve chegar em cerca de \\d+ min e durar uns ${detail.durationMin} min, pelo movimento`));
  assert.equal(event.metadata.intensity,'heavy');
  const storm=api.nowcastCandidate(arrival,now.getTime(),location,now,{...detail,intensity:'storm',open:true,durationMin:70});
  assert.equal(storm.title,'⛈️ Tempestade chegando');assert.match(storm.body,/e durar mais de 1 h, .*Raios, granizo/);
  const weak=api.nowcastCandidate(arrival,now.getTime(),location,now,{...detail,intensity:'weak',open:true,durationMin:30});
  assert.equal(weak.severity,2);assert.doesNotMatch(weak.body,/durar/,'projeção aberta e curta não diz duração');
});

test('vai engrossar: chove fraco na cidade e um trecho forte chega em 10 a 30 min',async()=>{
  const r=await radar(),C=r.CENTER;
  const before=await grid([C-16,C,40,25],[C-36,C,10,46]),after=await grid([C,C,40,25],[C-20,C,10,46]);
  const view=r.outlook(before,after,r.SIZE,1200,-3.1);
  assert.equal(view.now.dbz,25);
  const hit=r.worsening(view);
  assert.ok(hit);assert.equal(hit.intensity,'heavy');assert.ok(hit.minutes>=10&&hit.minutes<=30,String(hit.minutes));
  assert.equal(r.easing(view),null);
  const now=new Date('2026-11-12T15:05:00Z');
  const event=api.worseningCandidate(hit,now.getTime()-5*60_000,location,now);
  assert.equal(event.type,'rain_worsening');assert.equal(event.severity,3);assert.equal(event.title,'🌧️ A chuva vai engrossar');
  assert.match(event.body,/a chuva deve engrossar nos próximos \d+ min/);
  // Já forte agora: não há "engrossar".
  assert.equal(r.worsening(r.outlook(await grid([C-16,C,40,40]),await grid([C,C,40,40]),r.SIZE,1200,0)),null);
  // Sem chuva na cidade e sem chuva medida: é "chuva chegando", não "engrossar".
  assert.equal(r.worsening(r.outlook(await grid([C-60,C,14,42]),await grid([C-44,C,14,42]),r.SIZE,1200,0)),null);
  assert.equal(api.worseningCandidate(hit,now.getTime()-25*60_000,location,now),null,'imagem velha');
});

test('o pior já passou: o trecho forte se afasta e a próxima meia hora fica fraca ou seca',async()=>{
  const r=await radar(),C=r.CENTER;
  const before=await grid([C-6,C,12,45]),after=await grid([C+10,C,12,45]);
  const view=r.outlook(before,after,r.SIZE,1200,-3.1);
  const calm=r.easing(view);
  assert.ok(calm);assert.equal(calm.fromDbz,45);assert.equal(calm.stopsIn,10);
  const now=new Date('2026-11-12T15:00:00Z');
  const event=api.easingCandidate(calm,now.getTime(),location,now);
  assert.equal(event.type,'rain_easing');assert.equal(event.severity,1);assert.equal(event.title,'🌦️ O pior já passou');
  assert.match(event.body,/parar em cerca de 10 min/);
  // Era só chuva fraca: nada a dizer.
  assert.equal(r.easing(r.outlook(await grid([C-6,C,12,25]),await grid([C+10,C,12,25]),r.SIZE,1200,0)),null);
  // O forte continua em cima da cidade: ainda não passou.
  assert.equal(r.easing(r.outlook(await grid([C-16,C,40,45]),await grid([C,C,40,45]),r.SIZE,1200,0)),null);
});

function weather(now,past,next,chance=80){
  const t=Math.floor(now.getTime()/3600000)*3600,time=[],precipitation=[],precipitation_probability=[];
  for(let h=-8;h<=6;h++){time.push(t+h*3600);precipitation.push(h<=0?(h>-6?past:0):h<=3?next:0);precipitation_probability.push(h<=0?100:chance);}
  return {current:{time:t},hourly:{time,precipitation,precipitation_probability}};
}

test('risco de alagamento: chuva acumulada nas últimas horas e mais chuva vindo',()=>{
  const now=new Date('2026-11-12T18:20:00Z');
  const flood=api.floodCandidate(weather(now,5,5),null,location,now); // 30 mm em 6 h + 15 mm previstos
  assert.equal(flood,null,'45 mm somados: ainda não');
  const event=api.floodCandidate(weather(now,7,6),null,location,now); // 42 + 18
  assert.equal(event.type,'flood_risk');assert.equal(event.severity,3);assert.equal(event.title,'🌊 Risco de alagamento');
  assert.match(event.body,/^Já choveu cerca de 42 mm nas últimas 6 h em Manaus e podem cair mais uns 18 mm nas próximas 3 h\. Risco de alagamentos e enxurradas/);
  assert.equal(api.floodCandidate(weather(now,15,15),null,location,now).severity,4,'≥ 100 mm somados');
  assert.equal(api.floodCandidate(weather(now,10,2),null,location,now),null,'sem mais chuva vindo');
  assert.equal(api.floodCandidate(weather(now,1,20),null,location,now),null,'sem chuva acumulada');
  assert.equal(api.floodCandidate(weather(now,8,6,30),null,location,now),null,'chance baixa não conta');
  // As 2 horas mais recentes vêm da estação quando a leitura é recente: mediu seco, o risco cai.
  const dry={station:{ibge:'1302603'},time:'2026-11-12T18:00:00Z',rainMm:0,previousRainMm:0};
  assert.equal(api.floodCandidate(weather(now,7,6),dry,location,now),null);
  const wet={...dry,rainMm:20,previousRainMm:15};
  const measured=api.floodCandidate(weather(now,7,6),wet,location,now);
  assert.equal(measured.metadata.past_6h_mm,63);assert.match(measured.source,/INMET · estação/);
  assert.equal(api.floodCandidate(weather(now,7,6),{...wet,time:'2026-11-12T16:00:00Z'},location,now).metadata.station_measured,false,'leitura velha não entra');
  // Horas passadas faltando nunca viram zero.
  const gaps=weather(now,7,6);gaps.hourly.precipitation[5]=null;gaps.hourly.precipitation[6]=null;
  assert.equal(api.floodCandidate(gaps,null,location,now),null);
});

test('limite diário: só avisos fracos contam e só eles são barrados',()=>{
  const low=n=>Array.from({length:n},()=>({status:'accepted',notification_events:{event_type:'rain_approaching',severity:2}}));
  assert.equal(policy.LOW_DAILY_CAP,4);
  assert.equal(policy.overDailyCap({type:'weather_change',severity:2},low(3)),false);
  assert.equal(policy.overDailyCap({type:'weather_change',severity:2},low(4)),true);
  assert.equal(policy.overDailyCap({type:'rain_incoming',severity:3},low(10)),false,'forte sempre passa');
  assert.equal(policy.overDailyCap({type:'official_alert',severity:2},low(10)),false,'aviso oficial sempre passa');
  assert.equal(policy.overDailyCap({type:'daily_summary',severity:1},low(10)),false,'resumo marcado pela pessoa sempre passa');
  const mixed=[...low(3),{status:'accepted',notification_events:{event_type:'heavy_rain',severity:3}},{status:'failed',notification_events:{event_type:'rain_now',severity:2}},{status:'accepted',notification_events:{event_type:'daily_summary',severity:1}}];
  assert.equal(policy.overDailyCap({type:'rain_now',severity:2},mixed),false,'fortes, falhas e resumos não entram na conta');
  assert.equal(policy.lowPriority({event_type:'rain_easing',severity:1}),true);
  // Meia-noite em Manaus (UTC-4).
  assert.equal(api.localDayStart('America/Manaus',new Date('2026-11-12T18:20:30Z')).toISOString(),'2026-11-12T04:00:00.000Z');
  assert.equal(api.localDayStart('America/Manaus',new Date('2026-11-13T02:00:00Z')).toISOString(),'2026-11-12T04:00:00.000Z');
});

test('"o pior já passou" só para quem recebeu aviso forte, uma vez por aviso',()=>{
  const now=Date.parse('2026-11-12T18:00:00Z'),ago=min=>new Date(now-min*60000).toISOString();
  const strong=(type,min,severity=3)=>({status:'accepted',sent_at:ago(min),notification_events:{event_type:type,severity}});
  assert.equal(policy.easeAllowed([],{now}),false);
  assert.equal(policy.easeAllowed([strong('rain_incoming',40,2)],{now}),false,'chuva chegando fraca não abre');
  assert.equal(policy.easeAllowed([strong('rain_incoming',40)],{now}),true);
  assert.equal(policy.easeAllowed([strong('heavy_rain',40)],{now}),true);
  assert.equal(policy.easeAllowed([strong('storm_now',5)],{now}),false,'cedo demais');
  assert.equal(policy.easeAllowed([strong('rain_worsening',60),{status:'accepted',sent_at:ago(20),notification_events:{event_type:'rain_easing',severity:1}}],{now}),false,'já avisou');
  assert.equal(policy.easeAllowed([strong('rain_worsening',60),{status:'accepted',sent_at:ago(50),notification_events:{event_type:'rain_easing',severity:1}},strong('storm',30)],{now}),true,'aviso forte novo depois');
});

test('lote: "o pior já passou" sai se há "parou" ou "engrossar"; "engrossar" logo depois de "forte chegando" é repetição',()=>{
  const pick=types=>policy.selectCandidates(types.map(([type,severity])=>({type,severity}))).map(c=>c.type).sort();
  assert.deepEqual(pick([['rain_easing',1],['rain_stopped',1]]),['rain_stopped']);
  assert.deepEqual(pick([['rain_easing',1],['rain_worsening',3]]),['rain_worsening']);
  assert.deepEqual(pick([['rain_easing',1],['flood_risk',3]]),['flood_risk','rain_easing']);
  const now=Date.parse('2026-11-12T18:00:00Z');
  const incoming=min=>[{status:'accepted',sent_at:new Date(now-min*60000).toISOString(),notification_events:{event_type:'rain_incoming',severity:3,city_id:'1302603'}}];
  const candidate={type:'rain_worsening',severity:3,cityId:'1302603'};
  assert.equal(policy.isRepeat(candidate,incoming(30),now),true);
  assert.equal(policy.isRepeat(candidate,incoming(100),now),false);
  assert.equal(policy.isRepeat({...candidate,cityId:'3550308'},incoming(30),now),false);
});

test('ligação: tipos novos na migration, nas preferências, nos estilos e no envio',()=>{
  const migration=fs.readFileSync('supabase/migrations/20261112180000_smart_alert_events.sql','utf8');
  for(const type of ['rain_worsening','rain_easing','flood_risk','rain_incoming','official_alert','test']) assert.ok(migration.includes(`'${type}'`),type);
  assert.match(processor,/rain_worsening: "rain_approaching", rain_easing: "rain_approaching", flood_risk: "heavy_rain"/);
  const style=require('../dist/modules/push-style.js');
  for(const type of ['rain_worsening','rain_easing','flood_risk']) assert.ok(style.STYLES[type],type);
  assert.match(processor,/if \(lowPriority\(event\)\) \{/);
  assert.match(processor,/event\.type === "rain_easing" \? !easeAllowed\(recent \|\| \[\]\)/);
  assert.match(processor,/preference\.rain_approaching && weatherForNowcast && \(raining \|\| rainLikelySoon\(weatherForNowcast\)\)/,'radar também com chuva agora');
  assert.match(processor,/const arrival = raining \? null : estimateArrival/,'chegada só sem chuva agora');
});
