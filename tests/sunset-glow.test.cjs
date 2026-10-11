const {test}=require('node:test');
const assert=require('node:assert/strict');
const insights=require('../dist/modules/weather-insights.js');
const time=require('../dist/modules/city-time.js');

const city={id:'1302603',name:'Manaus',uf:'AM',timezone:'America/Manaus'};
const hours=['2026-10-11T16:00','2026-10-11T17:00','2026-10-11T18:00','2026-10-11T19:00'];
const setAt=time.parse('2026-10-11T17:52',city);
const hourly=(layers={},extra={})=>({time:hours,
  cloud_cover_low:[0,0,layers.low ?? 10,0], cloud_cover_mid:[0,0,layers.mid ?? 40,0], cloud_cover_high:[0,0,layers.high ?? 30,0],
  weather_code:[1,1,extra.code ?? 2,2], precipitation_probability:[0,0,0,extra.chance ?? 10]});

test('nuvens médias/altas espalhadas e horizonte limpo: pôr do sol promete',()=>{
  assert.equal(insights.sunsetGlow(hourly(),setAt,city).tone,'promising');
});
test('nuvens baixas, chuva e céu limpo têm frases próprias',()=>{
  assert.equal(insights.sunsetGlow(hourly({low:80}),setAt,city).tone,'hidden');
  assert.equal(insights.sunsetGlow(hourly({},{code:61}),setAt,city).tone,'rain');
  assert.equal(insights.sunsetGlow(hourly({},{chance:60}),setAt,city).tone,'rain','chance do intervalo que começa na hora (i+1)');
  assert.equal(insights.sunsetGlow(hourly({low:5,mid:5,high:0}),setAt,city).tone,'clear');
});
test('céu fechado sem nuvens baixas dominantes não força frase',()=>{
  assert.equal(insights.sunsetGlow(hourly({low:30,mid:95,high:95}),setAt,city),null);
});
test('camada ausente ou pôr fora das horas da previsão não viram frase',()=>{
  const missing=hourly(); missing.cloud_cover_high[2]=null;
  assert.equal(insights.sunsetGlow(missing,setAt,city),null);
  const legacy=hourly(); delete legacy.cloud_cover_low;
  assert.equal(insights.sunsetGlow(legacy,setAt,city),null,'cache antigo sem camadas');
  assert.equal(insights.sunsetGlow(hourly(),setAt+5*3600000,city),null);
  assert.equal(insights.sunsetGlow(hourly(),NaN,city),null);
});

test('bolinha do app acompanha o aviso vigente e não quebra sem a API',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const app=fs.readFileSync(__dirname+'/../dist/app.js','utf8');
  const source=app.slice(app.indexOf('function syncAppBadge('),app.indexOf('function renderInmetAlerts('));
  const calls=[];
  const context=vm.createContext({globalThis:{navigator:{setAppBadge:()=>{calls.push('set');return Promise.reject(Error('x'));},clearAppBadge:()=>{calls.push('clear');return Promise.resolve();}}}});
  vm.runInContext(source,context);
  context.syncAppBadge(true);context.syncAppBadge(false);
  assert.deepEqual(calls,['set','clear']);
  const bare=vm.createContext({globalThis:{navigator:{}}});vm.runInContext(source,bare);
  assert.doesNotThrow(()=>bare.syncAppBadge(true));
  assert.match(app,/if \(!stale\) syncAppBadge\(Boolean\(bannerItem\)\)/,'leitura anterior não mexe na bolinha');
});
