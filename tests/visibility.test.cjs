const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const client=require('../dist/modules/station-now.js');

test('METAR: visibilidade em metros logo depois do vento; 9999 e CAVOK = 10 km ou mais',async()=>{
  const {parseVisibility,nearestAirport}=await import('../supabase/functions/_shared/metar.js');
  assert.deepEqual(parseVisibility('METAR SBEG 191500Z 04005KT 360V080 9999 BKN020 28/23 Q1013'),{meters:10000,plus:true});
  assert.deepEqual(parseVisibility('METAR SBMN 191500Z VRB03KT 4000 FU SCT025 30/25 Q1013'),{meters:4000,plus:false});
  assert.deepEqual(parseVisibility('SPECI SBEG 190610Z 00000KT 0400 FG VV001 24/24 Q1012'),{meters:400,plus:false});
  assert.deepEqual(parseVisibility('METAR SBGR 191500Z 12010G20KT CAVOK 25/12 Q1018'),{meters:10000,plus:true});
  assert.equal(parseVisibility('METAR SBGR 191500Z 12010KT 1/2SM FG'),null,'milhas americanas ficam de fora');
  assert.equal(parseVisibility(''),null);
  const now=Date.parse('2026-10-19T15:10:00Z');
  const airport=nearestAirport([{icaoId:'SBEG',obsTime:1792422000,lat:-3.039,lon:-60.05,temp:28,dewp:23,rawOb:'METAR SBEG 191500Z 04005KT 9999 BKN020 28/23 Q1013'}],-3.1,-60.02,now);
  assert.deepEqual(airport.visibility,{meters:10000,plus:true});
});

test('app guarda a visibilidade do aeroporto só quando é válida',()=>{
  const now=Date.parse('2026-10-19T15:10:00Z');
  const base={icao:'SBEG',distanceKm:9.5,time:'2026-10-19T15:00:00Z',weather:{rain:null}};
  assert.deepEqual(client.airportReading({airport:{...base,visibility:{meters:10000,plus:true}}},now).visibility,{meters:10000,plus:true});
  assert.equal(client.airportReading({airport:{...base,visibility:{meters:'9999'}}},now).visibility,null);
  assert.equal(client.airportReading({airport:base},now).visibility,null);
});

function screen(){
  const nodes={visibilityValue:{textContent:'',closest:()=>({setAttribute(k,v){nodes.label=v;}})},visibilityNote:{textContent:''}};
  const app=fs.readFileSync('dist/app.js','utf8');
  const src=app.slice(app.indexOf('const visibilityState = '),app.indexOf('\nfunction cache('));
  const ctx={$:id=>nodes[id],fmt:(v,d=0)=>Number.isFinite(v)?v.toFixed(d).replace('.',','):'--',formatUpdateTime:()=>'11:00',activeCity:{id:'1302603'},observedRainState:{airport:null,stationCity:null}};
  vm.runInNewContext(src+';globalThis.api={renderVisibility,paintVisibility}',ctx);
  return {nodes,ctx,api:ctx.api};
}
test('tela: medida no aeroporto vence o modelo e diz de onde veio',()=>{
  const {nodes,ctx,api}=screen();
  api.renderVisibility(480,false);
  assert.equal(nodes.visibilityValue.textContent,'480 m');
  assert.equal(nodes.visibilityNote.textContent,'Baixa · estimativa do modelo');
  ctx.observedRainState.airport={icao:'SBEG',at:1,visibility:{meters:10000,plus:true}};ctx.observedRainState.stationCity='1302603';
  api.paintVisibility();
  assert.equal(nodes.visibilityValue.textContent,'10+ km');
  assert.equal(nodes.visibilityNote.textContent,'Medida no aeroporto SBEG às 11:00');
  assert.equal(nodes.label,'Visibilidade medida');
  // Leitura de outra cidade não vale aqui.
  ctx.observedRainState.stationCity='3550308';api.paintVisibility();
  assert.equal(nodes.visibilityValue.textContent,'480 m');
  // Aeroporto com fumaça: 4 km medidos, reduzida.
  ctx.observedRainState.stationCity='1302603';ctx.observedRainState.airport={icao:'SBMN',at:1,visibility:{meters:4000,plus:false}};
  api.paintVisibility();
  assert.equal(nodes.visibilityValue.textContent,'4,0 km');assert.equal(nodes.visibilityNote.textContent,'Reduzida · medida no aeroporto SBMN às 11:00');
});
