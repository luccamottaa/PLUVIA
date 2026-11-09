// Tomorrow.io como segunda opinião nos avisos de chuva: alinhamento das horas, ausência ≠ seco, cota e 429.
const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');

function load(){
  const src=fs.readFileSync('supabase/functions/_shared/tomorrow.js','utf8').replace(/^export /gm,'');
  return vm.runInNewContext(src+';({tomorrowUrl,rainSeries,createTomorrowClient,MAX_PER_RUN,CACHE_MS,COOLDOWN_MS})',{URL,URLSearchParams,AbortController,setTimeout,clearTimeout,Date,Map,Number,Math,Array,Boolean});
}
const t=load();
const t0=Date.parse('2026-11-09T12:00:00Z')/1000;
const times=Array.from({length:6},(_,i)=>t0+i*3600);
const point=(offsetH,values)=>({time:new Date((t0+offsetH*3600)*1000).toISOString(),values});

test('a hora do Tomorrow.io que começa em T vale para o intervalo do Open-Meteo que termina em T+1h',()=>{
  const json={timelines:{hourly:[point(0,{rainAccumulation:0}),point(1,{rainAccumulation:2.4}),point(2,{precipitationIntensity:0.7}),point(3,{rainAccumulation:'1'})]}};
  assert.deepEqual(t.rainSeries(json,times),[null,0,2.4,0.7,null,null]);
});

test('sem pontos válidos não há série (nunca vira "seco")',()=>{
  assert.equal(t.rainSeries({timelines:{hourly:[point(0,{rainAccumulation:-1})]}},times),null);
  assert.equal(t.rainSeries({},times),null);
  assert.equal(t.rainSeries(null,times),null);
});

test('URL leva coordenadas arredondadas e a chave só como parâmetro',()=>{
  const url=new URL(t.tomorrowUrl(-3.119,-60.0217,'k'));
  assert.equal(url.origin+url.pathname,'https://api.tomorrow.io/v4/weather/forecast');
  assert.equal(url.searchParams.get('location'),'-3.119,-60.022');
  assert.equal(url.searchParams.get('timesteps'),'1h');
  assert.equal(url.searchParams.get('apikey'),'k');
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
  const client=t.createTomorrowClient({key:'k',now:()=>now,fetchImpl:async()=>{calls++;return {status,ok:status===200,json:async()=>({timelines:{hourly:[]}})};}});
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
