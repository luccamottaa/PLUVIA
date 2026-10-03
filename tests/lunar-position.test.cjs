const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {create}=require('../dist/modules/sky-atmosphere.js'),{city}=require('./support/forecast.cjs');
const context=vm.createContext({});vm.runInContext(fs.readFileSync('dist/vendor/suncalc.js','utf8'),context);
const {sun,moon}=context.PLUVIA;
test('Lua ilustrada acompanha noite municipal com movimento contínuo, inclusive abaixo do horizonte real',()=>{
 const sky=create({sun,moon});let above=0,below=0;
 const start=Date.parse('2026-10-01T00:00:00-04:00');
 sky.apply(0,0,null,city,start);
 for(let i=0;i<14*24;i++) {
  const at=start+i*3600000,position=moon.getMoonPosition(new Date(at),city.lat,city.lon),state=sky.update(at);
  if(state.phase==='night' && position.altitude>3) {above++;assert.ok(state.moonVisibility>0);}
  if(state.phase==='night' && position.altitude<=0) {below++;assert.ok(state.moonVisibility>0);}
  if(state.phase==='day') assert.equal(state.moonVisibility,0);
  assert.ok(state.moonX>=.12-1e-9 && state.moonX<=.88+1e-9);assert.ok(state.moonY>=0 && state.moonY<=1);
 }
 assert.ok(above>0 && below>0);
 const midnight=start+86400000,before=sky.update(midnight-1000),after=sky.update(midnight+1000);
 assert.ok(Math.abs(before.moonX-after.moonX)<.001);assert.ok(Math.abs(before.moonY-after.moonY)<.001);
 assert.deepEqual(after,create({sun,moon}).apply(0,0,null,city,midnight+1000),'reabrir não reinicia a trajetória');
});
test('ciclo da cidade muda a projeção no mesmo instante, sem depender da posição observacional',()=>{
 const at=Date.parse('2026-10-01T00:00:00Z');
 const a=create({sun,moon}).apply(0,0,null,city,at);
 const b=create({sun,moon}).apply(0,0,null,{...city,lat:-25.429,lon:-49.267,timezone:'America/Sao_Paulo'},at);
 assert.notEqual(a.moonX,b.moonX);
 assert.equal(create({moon:{getMoonPosition:()=>({altitude:NaN,azimuth:NaN})}}).apply(0,0,null,city,at).moonVisibility,1);
});
