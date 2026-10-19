const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const insights=require('../dist/modules/weather-insights.js');
const agreement=require('../dist/modules/model-agreement.js');

const times=Array.from({length:14},(_,i)=>`2026-10-19T${String(8+i).padStart(2,'0')}:00`);
function hourly({mm=()=>0,chance=()=>5}={}){
  return {time:times,precipitation:times.map((_,i)=>i===0?0:mm(i)),precipitation_probability:times.map((_,i)=>i===0?0:chance(i)),weather_code:times.map(()=>3)};
}
function payload(series){
  const hourly={time:times};
  for(const [model,values] of Object.entries(series)) hourly[`precipitation_${model}`]=values;
  return {hourly};
}
const zero=()=>times.map(()=>0);

test('"Vai chover?" devolve a janela da chuva em fins de intervalo (i+1)',()=>{
  const rain=insights.rainAnswer(hourly({mm:i=>i>=4&&i<=6?2:0,chance:i=>i>=4&&i<=6?80:5}),0);
  assert.equal(rain.tone,'rain');assert.deepEqual(rain.window,[times[4],times[6]]);
  const maybe=insights.rainAnswer(hourly({chance:i=>i===3||i===4?40:5}),0);
  assert.equal(maybe.tone,'maybe');assert.deepEqual(maybe.window,[times[3],times[4]]);
  const dry=insights.rainAnswer(hourly(),0);
  assert.equal(dry.tone,'dry');assert.equal(dry.window,undefined);
});

test('conta só os modelos com a janela inteira válida e exige pelo menos dois',()=>{
  const wet=zero();wet[5]=1.2;
  const holes=zero();holes[5]=null;
  assert.deepEqual(agreement.count(payload({ecmwf_ifs025:wet,gfs_seamless:zero(),icon_seamless:wet}),[times[4],times[6]]),{agree:2,total:3});
  assert.deepEqual(agreement.count(payload({ecmwf_ifs025:wet,gfs_seamless:holes,icon_seamless:zero()}),[times[4],times[6]]),{agree:1,total:2});
  assert.equal(agreement.count(payload({ecmwf_ifs025:wet,gfs_seamless:holes}),[times[4],times[6]]),null);
  assert.equal(agreement.count(payload({ecmwf_ifs025:wet,gfs_seamless:wet}),['2026-10-20T08:00','2026-10-20T09:00']),null);
  // Fora da janela não conta; limiar menor para "pode chover".
  const late=zero();late[9]=3;const drizzle=zero();drizzle[5]=0.3;
  assert.deepEqual(agreement.count(payload({ecmwf_ifs025:late,gfs_seamless:drizzle}),[times[4],times[6]]),{agree:0,total:2});
  assert.deepEqual(agreement.count(payload({ecmwf_ifs025:late,gfs_seamless:drizzle}),[times[4],times[6]],0.2),{agree:1,total:2});
});

test('frase e nível vêm só da contagem, sem nota inventada',()=>{
  assert.equal(agreement.describe({agree:3,total:3}).level,'high');
  assert.match(agreement.describe({agree:3,total:3}).text,/outros 3 modelos também preveem/);
  assert.equal(agreement.describe({agree:1,total:3}).level,'moderate');
  assert.match(agreement.describe({agree:1,total:3}).text,/^1 de 3 outros modelos/);
  assert.equal(agreement.describe({agree:0,total:2}).level,'low');
  assert.match(agreement.describe({agree:0,total:2}).text,/pode não acontecer/);
  assert.equal(agreement.describe(null),null);
  assert.ok(!/%/.test(JSON.stringify([agreement.describe({agree:2,total:3})])));
});

test('consulta uma vez por cidade em 15 min, com os três modelos e o fuso da cidade',async()=>{
  const city={id:'1302603',lat:-3.1019,lon:-60.025,timezone:'America/Manaus'};
  const url=new URL(agreement.requestUrl(city));
  assert.equal(url.searchParams.get('models'),'ecmwf_ifs025,gfs_seamless,icon_seamless');
  assert.equal(url.searchParams.get('timezone'),'America/Manaus');
  assert.equal(url.searchParams.get('hourly'),'precipitation');
  assert.equal(agreement.requestUrl({lat:1,lon:2}),null);
  const wet=zero();wet[5]=2;let calls=0;
  globalThis.PLUVIA={http:{createClient:()=>({getJson:async()=>{calls++;return payload({ecmwf_ifs025:wet,gfs_seamless:wet,icon_seamless:zero()});}})}};
  agreement.clear();
  const first=await agreement.check(city,[times[4],times[6]],{now:0});
  const again=await agreement.check(city,[times[4],times[6]],{now:60_000});
  assert.equal(first.level,'moderate');assert.equal(again.level,'moderate');assert.equal(calls,1);
  await agreement.check(city,[times[4],times[6]],{now:16*60_000});
  assert.equal(calls,2);
  delete globalThis.PLUVIA;
});

test('o app não mostra mais o índice de confiança fixo',()=>{
  const app=fs.readFileSync('dist/app.js','utf8');
  assert.equal(typeof insights.pluviaConfidence,'undefined');
  assert.ok(!/de concordância`/.test(app));
  assert.match(app,/modelAgreement/);
});
