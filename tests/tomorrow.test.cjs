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

test('URL do Timelines: só os campos de chuva, hora cheia e horizonte curto',()=>{
  const now=Date.parse('2026-11-09T12:37:15Z');
  const url=new URL(t.tomorrowUrl(-3.119,-60.0217,'k',now));
  assert.equal(url.origin+url.pathname,'https://api.tomorrow.io/v4/timelines');
  assert.equal(url.searchParams.get('location'),'-3.119,-60.022');
  assert.equal(url.searchParams.get('fields'),'rainAccumulation,precipitationIntensity');
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
  assert.equal(JSON.stringify(warnings),JSON.stringify([['tomorrow unavailable',{status:400}]]));
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

test('função de teste: 120 horas, extras no mesmo pedido e volta aos campos de sempre num 400 (1.73.4)',()=>{
  const fs=require('node:fs');
  const shared=fs.readFileSync('supabase/functions/_shared/tomorrow-forecast.js','utf8'),fn=fs.readFileSync('supabase/functions/tomorrow-forecast/index.js','utf8');
  assert.match(shared,/export const TEST_HOURS = 120;/);
  for(const field of ['dewPoint','cloudBase','cloudCeiling','pressureSurfaceLevel','precipitationType','rainIntensity','evapotranspiration','uvHealthConcern']) assert.ok(shared.includes("'"+field+"'"),field);
  assert.match(fn,/tomorrowUrl\(lat, lon, key, now, fields, TEST_HOURS\)/);
  assert.match(fn,/if \(refused\(response\.status\) && !extrasRefused\) \{/);
  assert.match(fn,/const fields = \(\) => extrasRefused \? TEST_FIELDS :/,'último nível: só os campos de sempre');
});

test('função de teste: ar num nível próprio, que sai antes dos extras numa recusa 400/403 (1.73.6)',()=>{
  const fs=require('node:fs');
  const shared=fs.readFileSync('supabase/functions/_shared/tomorrow-forecast.js','utf8'),fn=fs.readFileSync('supabase/functions/tomorrow-forecast/index.js','utf8');
  for(const field of ['epaIndex','particulateMatter25','particulateMatter10','pollutantO3','pollutantNO2','pollutantSO2']) assert.ok(shared.includes("'"+field+"'"),field);
  assert.match(fn,/const refused = status => status === 400 \|\| status === 403;/);
  assert.ok(fn.indexOf('airRefused = true')<fn.indexOf('extrasRefused = true'),'tira o ar antes dos extras');
});

test('mapa de chuva do Tomorrow.io: só Brasil, zoom 3 a 7 e horas cheias perto de agora (1.73.9)', async () => {
  const t = await import('../supabase/functions/_shared/tomorrow-tiles.js');
  assert.equal(t.tileAllowed(7, 42, 65), true, 'Manaus');
  assert.equal(t.tileAllowed(4, 5, 8), true);
  assert.equal(t.tileAllowed(7, 10, 40), false, 'Pacífico');
  assert.equal(t.tileAllowed(8, 84, 130), false, 'zoom 8 não');
  assert.equal(t.tileAllowed(2, 1, 2), false, 'zoom 2 não');
  assert.equal(t.tileAllowed(7, 42.5, 65), false);
  const now = Date.parse('2026-11-12T21:40:00Z'), hour = Date.parse('2026-11-12T21:00:00Z') / 1000;
  assert.equal(t.tileTime(String(hour), now), hour);
  assert.equal(t.tileTime(String(hour + 3 * 3600), now), hour + 3 * 3600);
  assert.equal(t.tileTime(String(hour - 2 * 3600), now), hour - 2 * 3600);
  assert.equal(t.tileTime(String(hour - 3 * 3600), now), null, 'passado demais');
  assert.equal(t.tileTime(String(hour + 7 * 3600), now), null, 'futuro demais');
  assert.equal(t.tileTime(String(hour + 600), now), null, 'só hora cheia');
  assert.equal(t.tileTime('now', now), null);
  const fn = fs.readFileSync('supabase/functions/tomorrow-tiles/index.js', 'utf8');
  assert.doesNotMatch(fn, /console\.\w+\([^)]*(apikey|response\.url|key\))/, 'a chave nunca vai para log');
  assert.match(fn, /'Content-Type': 'image\/png'/);
  assert.match(fs.readFileSync('supabase/config.toml', 'utf8'), /\[functions\.tomorrow-tiles\]\nverify_jwt = false|\[functions\.tomorrow-tiles\]\n#[^\n]*\nverify_jwt = false/);
  assert.match(fs.readFileSync('.github/workflows/deploy-function.yml', 'utf8'), /- tomorrow-tiles\n/);
  const map = fs.readFileSync('dist/weather-map.js', 'utf8');
  assert.match(map, /const rainSource = \(\) => tomorrowTest\(\) \? \(state\.source \|\| 'tomorrow'\) : 'radar';/, 'sem o teste, sempre o RainViewer');
  assert.match(map, /last\.forecast \|\| last\.tomorrow\) return;/, 'sem a extrapolação do RainViewer em cima do Tomorrow.io');
  assert.match(map, /\$\{TOMORROW_TILES\}\?z=\{z\}&x=\{x\}&y=\{y\}&t=\$\{frame\.time\}/);
  const css = fs.readFileSync('dist/continuous.css', 'utf8');
  assert.match(css, /:is\(\.weather-player,#weatherMapRecenter,\.leaflet-control-zoom,\.weather-map-retry,\.weather-source-toggle\)/, 'botão fora da miniatura da Home');
});
