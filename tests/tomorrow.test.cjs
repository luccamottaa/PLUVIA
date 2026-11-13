// Tomorrow.io como segunda opinião nos avisos de chuva: alinhamento das horas, ausência ≠ seco, cota e 429.
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');

function load(){
  const src=fs.readFileSync('supabase/functions/_shared/tomorrow.js','utf8').replace(/^export /gm,'');
  return vm.runInNewContext(src+';({tomorrowUrl,rainSeries,createTomorrowClient,MAX_PER_RUN,CACHE_MS,COOLDOWN_MS,HORIZON_H})',{URL,URLSearchParams,AbortController,setTimeout,clearTimeout,Date,Map,Number,Math,Array,Boolean,console:{warn:(...args)=>warnings.push(args)}});
}
const warnings=[];
const t=load();
const t0=Date.parse('2026-11-09T12:00:00Z')/1000;
const times=Array.from({length:6},(_,i)=>t0+i*3600);
const point=(offsetH,values)=>({time:new Date((t0+offsetH*3600)*1000).toISOString(),values});
const interval=(offsetH,values)=>({startTime:new Date((t0+offsetH*3600)*1000).toISOString(),values});
const timelines=(...intervals)=>({data:{timelines:[{timestep:'1h',startTime:'',endTime:'',intervals}]}});

test('Timelines: o intervalo que começa em T vale para o intervalo do Open-Meteo que termina em T+1h',()=>{
  const json=timelines(interval(0,{rainAccumulation:0}),interval(1,{rainAccumulation:2.4}),interval(2,{precipitationIntensity:0.7}),interval(3,{rainAccumulation:'1'}));
  assert.deepEqual(t.rainSeries(json,times),[null,0,2.4,0.7,null,null]);
});

test('Timelines sem a timeline de 1h ou com valores inválidos não vira série',()=>{
  assert.equal(t.rainSeries({data:{timelines:[{timestep:'1d',intervals:[interval(0,{rainAccumulation:3})]}]}},times),null);
  assert.equal(t.rainSeries(timelines(interval(0,{rainAccumulation:-1}),interval(1,{})),times),null);
  assert.equal(t.rainSeries({data:{timelines:'x'}},times),null);
});

test('formato antigo do /v4/weather/forecast continua aceito',()=>{
  const json={timelines:{hourly:[point(0,{rainAccumulation:0}),point(1,{rainAccumulation:2.4}),point(2,{precipitationIntensity:0.7}),point(3,{rainAccumulation:'1'})]}};
  assert.deepEqual(t.rainSeries(json,times),[null,0,2.4,0.7,null,null]);
});

test('sem pontos válidos não há série (nunca vira "seco")',()=>{
  assert.equal(t.rainSeries({timelines:{hourly:[point(0,{rainAccumulation:-1})]}},times),null);
  assert.equal(t.rainSeries({},times),null);
  assert.equal(t.rainSeries(null,times),null);
});

test('URL do Timelines: campos de chuva e trovoada, hora cheia e horizonte curto',()=>{
  const now=Date.parse('2026-11-09T12:37:15Z');
  const url=new URL(t.tomorrowUrl(-3.119,-60.0217,'k',now));
  assert.equal(url.origin+url.pathname,'https://api.tomorrow.io/v4/timelines');
  assert.equal(url.searchParams.get('location'),'-3.119,-60.022');
  assert.equal(url.searchParams.get('fields'),'rainAccumulation,precipitationIntensity,thunderstormProbability');
  assert.equal(url.searchParams.get('timesteps'),'1h');
  assert.equal(url.searchParams.get('units'),'metric');
  assert.equal(url.searchParams.get('startTime'),'2026-11-09T12:00:00.000Z','começa na hora cheia, não no minuto da consulta');
  assert.equal(Date.parse(url.searchParams.get('endTime'))-Date.parse(url.searchParams.get('startTime')),t.HORIZON_H*3600_000);
  assert.ok(t.HORIZON_H>=48,'cobre as 48 h da consulta dos outros modelos');
  assert.equal(url.searchParams.get('apikey'),'k');
});

test('resposta recusada (400) registra só o status, nunca a URL com a chave',async()=>{
  warnings.length=0;
  const client=t.createTomorrowClient({key:'segredo',fetchImpl:async()=>({status:400,ok:false,json:async()=>({})})});
  client.startRun();
  assert.equal(await client.forecast(-3,-60),null);
  // A primeira recusa desliga só as horas passadas (1.73.11); a segunda é registrada como indisponível.
  assert.equal(JSON.stringify(warnings),JSON.stringify([['tomorrow history refused',{status:400}],['tomorrow unavailable',{status:400}]]));
  assert.doesNotMatch(JSON.stringify(warnings),/segredo|api\.tomorrow/);
});

test('sem chave não consulta nada',async()=>{
  let calls=0;
  const client=t.createTomorrowClient({key:'',fetchImpl:async()=>{calls++;}});
  assert.equal(client.enabled,false);
  assert.equal(await client.forecast(-3,-60),null);
  assert.equal(calls,0);
});

test('cache por coordenada, teto por rodada e pausa depois do 429',async()=>{
  let now=0,calls=0,status=200;
  const client=t.createTomorrowClient({key:'k',now:()=>now,fetchImpl:async()=>{calls++;return {status,ok:status===200,json:async()=>timelines()};}});
  client.startRun();
  await client.forecast(-3.1,-60);
  await client.forecast(-3.1,-60); // cache
  assert.equal(calls,1);
  await client.forecast(-1.4,-48.5);
  await client.forecast(-8,-35); // passou do teto da rodada
  assert.equal(calls,t.MAX_PER_RUN);
  client.startRun();now=t.CACHE_MS+1;status=429;
  assert.equal(await client.forecast(-3.1,-60),null);
  const after=calls;
  await client.forecast(-1.4,-48.5); // em pausa
  assert.equal(calls,after);
  client.startRun();now+=t.COOLDOWN_MS+1;status=200;
  assert.ok(await client.forecast(-1.4,-48.5));
  assert.equal(calls,after+1);
});

test('falha de rede devolve null sem lançar',async()=>{
  const client=t.createTomorrowClient({key:'k',fetchImpl:async()=>{throw new Error('offline');}});
  client.startRun();
  assert.equal(await client.forecast(-3,-60),null);
});

test('Tomorrow.io entra na concordância dos avisos de chuva como mais uma opinião',()=>{
  const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/push-process/index.ts','utf8').replace(/^import .*;\n/gm,''));
  const api=vm.runInNewContext(source.slice(0,source.indexOf('// Criado na primeira rodada'))+';({withAgreement,withTomorrow})',{Intl,Date,URL,URLSearchParams});
  const base=1792382400,hours=Array.from({length:8},(_,i)=>base+i*3600);
  const dry=hours.map(()=>0),wet=hours.map((_,i)=>i===2?3:0);
  const others={hourly:{time:hours,precipitation_ecmwf_ifs025:wet,precipitation_gfs_seamless:dry,precipitation_icon_seamless:dry}};
  const rain={type:'rain_approaching',severity:2,body:'Chuva fraca.',metadata:{window:[base+7200,base+7200]}};
  const withT=api.withAgreement(rain,api.withTomorrow(others,wet));
  assert.match(withT.body,/2 de 4 outros modelos também preveem chuva/);
  assert.equal(withT.metadata.agreement.tomorrow,'rain');
  const noT=api.withAgreement(rain,api.withTomorrow(others,null));
  assert.match(noT.body,/1 de 3 outros/);
  assert.equal(noT.metadata.agreement.tomorrow,null);
  assert.equal(others.hourly.precipitation_tomorrow,undefined,'não altera a resposta original');
});

test('função de teste: 120 horas e níveis opcionais que saem um a um numa recusa 400/403 (1.73.11)', async () => {
  const fs=require('node:fs');
  const shared=fs.readFileSync('supabase/functions/_shared/tomorrow-forecast.js','utf8'),fn=fs.readFileSync('supabase/functions/tomorrow-forecast/index.js','utf8');
  assert.match(shared,/export const TEST_HOURS = 120;/);
  const m=await import('../supabase/functions/_shared/tomorrow-forecast.js');
  const all=m.requestPlan(new Set());
  for(const field of ['dewPoint','cloudBase','evapotranspiration','epaIndex','particulateMatter25','thunderstormProbability']) assert.ok(all.fields.includes(field),field);
  assert.equal(all.timesteps,'current,1h,1m');assert.equal(all.pastHours,6);
  assert.deepEqual([...m.OPTIONAL_LEVELS],['air','thunder','minutely','history','extras'],'a qualidade do ar sai primeiro, os extras por último');
  const refused=new Set();const order=[];
  for(let level=m.nextRefusal(refused);level;level=m.nextRefusal(refused)){refused.add(level);order.push(level);}
  assert.deepEqual(order,['air','thunder','minutely','history','extras']);
  const bare=m.requestPlan(refused);
  assert.deepEqual(bare.fields,m.TEST_FIELDS);assert.equal(bare.timesteps,'current,1h');assert.equal(bare.pastHours,0);
  assert.match(fn,/tomorrowUrl\(lat, lon, key, now, plan\.fields, TEST_HOURS, plan\.pastHours\)/);
  assert.match(fn,/for \(let level = nextRefusal\(refusedLevels\); refused\(response\.status\) && level; level = nextRefusal\(refusedLevels\)\) \{/);
  assert.match(fn,/const refused = status => status === 400 \|\| status === 403;/);
});
test('mapa do Tomorrow.io fora do radar; tomorrow-tiles só responde 410 sem chamar o provedor (1.73.10)', () => {
  const fs = require('node:fs');
  const map = fs.readFileSync('dist/weather-map.js', 'utf8'), html = fs.readFileSync('dist/index.html', 'utf8');
  assert.doesNotMatch(map, /tomorrow-tiles|TOMORROW_TILES/);
  assert.doesNotMatch(html, /weatherSourceToggle/);
  const fn = fs.readFileSync('supabase/functions/tomorrow-tiles/index.js', 'utf8');
  assert.doesNotMatch(fn, /fetch\(|api\.tomorrow\.io|TOMORROW_API_KEY/, 'nenhuma consulta, nenhuma cota');
  assert.match(fn, /status: 410/);
});

test('normalização: chuva das últimas 6 h, minuto a minuto e trovoada; poucas horas ou minutos não viram dado (1.73.11)', async () => {
  const m = await import('../supabase/functions/_shared/tomorrow-forecast.js');
  const now = Date.parse('2026-11-13T01:20:00Z'), hour = Date.parse('2026-11-13T01:00:00Z');
  const hourly = Array.from({length:12}, (_, i) => ({startTime:new Date(hour + (i - 6) * 3600e3).toISOString(), values:{temperature:26, rainAccumulation:i < 6 ? 2 : 0, thunderstormProbability:i === 7 ? 40 : 5}}));
  const minutely = Array.from({length:61}, (_, i) => ({startTime:new Date(now + i * 60e3).toISOString(), values:{precipitationIntensity:i > 30 ? 4 : 0}}));
  const json = {data:{timelines:[{timestep:'current', intervals:[{startTime:new Date(now).toISOString(), values:{temperature:26}}]}, {timestep:'1h', intervals:hourly}, {timestep:'1m', intervals:minutely}]}};
  const out = m.normalizeTomorrow(json, now);
  assert.deepEqual({...out.recent}, {mm:12, hours:6});
  assert.equal(out.minutely.length, 61); assert.equal(out.minutely[40].mm, 4);
  assert.equal(out.hourly.find(h => h.thunderPct === 40)?.time, new Date(hour + 3600e3).toISOString());
  const short = m.normalizeTomorrow({data:{timelines:[{timestep:'1h', intervals:hourly.slice(4)}, {timestep:'1m', intervals:minutely.slice(0, 10)}]}}, now);
  assert.equal(short.recent, undefined, '2 horas passadas não bastam'); assert.equal(short.minutely, undefined);
});

test('avisos: Tomorrow.io pede 6 h de passado junto e para de pedir numa recusa; pastRain por janela (1.73.11)', async () => {
  const now = Date.parse('2026-11-09T12:37:15Z');
  const url = new URL(t.tomorrowUrl(-3.119, -60.0217, 'k', now, undefined, undefined, 6));
  assert.equal(url.searchParams.get('startTime'), '2026-11-09T06:00:00.000Z');
  assert.equal(Date.parse(url.searchParams.get('endTime')) - Date.parse('2026-11-09T12:00:00Z'), t.HORIZON_H * 3600e3, 'o fim continua contado da hora atual');
  const asked = [];
  const client = t.createTomorrowClient({key:'k', now:() => now, fetchImpl:async (u) => { asked.push(new URL(u).searchParams.get('startTime')); return asked.length === 1 ? {status:403, ok:false, json:async () => ({})} : {status:200, ok:true, json:async () => timelines()}; }});
  client.startRun(); await client.forecast(-3.1, -60);
  assert.deepEqual(asked, ['2026-11-09T06:00:00.000Z', '2026-11-09T12:00:00.000Z']);
  const sh = await import('../supabase/functions/_shared/tomorrow.js');
  const h = Date.parse('2026-11-09T12:00:00Z');
  const json = timelines(...Array.from({length:8}, (_, i) => ({startTime:new Date(h + (i - 6) * 3600e3).toISOString(), values:{rainAccumulation:i < 4 ? 5 : i < 6 ? 2 : 0}})));
  assert.equal(sh.pastRain(json, now, 6, 2), 20); assert.equal(sh.pastRain(json, now, 2, 0), 4); assert.equal(sh.pastRain(json, now), 24);
  assert.equal(sh.pastRain(timelines(), now), null);
});

test('avisos gastam pouco do Tomorrow.io: 1 consulta por rodada e cache de 1 h (12 por hora no pior caso)',()=>{
  assert.equal(t.MAX_PER_RUN,1);assert.equal(t.CACHE_MS,3600_000);
  assert.ok(t.MAX_PER_RUN*12<=12,'a cada 5 min, no máximo 12 consultas por hora das 25 do plano grátis');
});

test('trovoada do Tomorrow.io no aviso de tempestade: chance e hora, ou "pouca chance" (1.73.13)', async () => {
  const sh = await import('../supabase/functions/_shared/tomorrow.js');
  const h = Date.parse('2026-11-12T18:00:00Z'), now = h + 20 * 60e3;
  const json = timelines(...[10, 35, 70, 90].map((pct, i) => ({startTime:new Date(h + i * 3600e3).toISOString(), values:{thunderstormProbability:pct}})));
  assert.deepEqual({...sh.thunderPeak(json, now)}, {pct:70, at:h + 2 * 3600e3}, 'só as próximas 3 horas cheias');
  assert.equal(sh.thunderPeak(timelines(), now), null);
  const source = stripTypeScriptTypes(fs.readFileSync('supabase/functions/push-process/index.ts','utf8').replace(/^import .*;\n/gm,''));
  const api = vm.runInNewContext(source.slice(0, source.indexOf('// Criado na primeira rodada')) + ';({withThunder})', {Intl, Date, URL, URLSearchParams});
  const storm = {type:'storm', severity:3, body:'Sinal de trovoada agora em Manaus.', metadata:{}};
  const loc = {timezone:'America/Manaus'};
  const strong = api.withThunder(storm, {pct:70, at:h + 2 * 3600e3}, loc);
  assert.equal(strong.body, 'Sinal de trovoada agora em Manaus. O Tomorrow.io dá 70% de chance de trovoada por volta das 16:00.');
  assert.equal(strong.metadata.tomorrow_thunder_pct, 70);
  assert.match(api.withThunder(storm, {pct:8, at:h}, loc).body, /O Tomorrow\.io vê pouca chance de trovoada nas próximas 3 h \(8%\)\.$/);
  assert.equal(api.withThunder(storm, null, loc), storm);
  assert.match(fs.readFileSync('supabase/functions/push-process/index.ts','utf8'), /if \(selected\.some\(candidate => candidate\.type === "storm"\) && tomorrowClient\?\.enabled\) \{/);
  assert.match(fs.readFileSync('supabase/migrations/20261113030000_push_cron_timeout.sql','utf8'), /timeout_milliseconds := 120000/);
});
