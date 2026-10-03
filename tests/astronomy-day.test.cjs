const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const time=require('../dist/modules/city-time.js'),{create}=require('../dist/modules/sky-atmosphere.js');
const vendor=vm.createContext({});vm.runInContext(fs.readFileSync('dist/vendor/suncalc.js','utf8'),vendor);
const {sun,moon}=vendor.PLUVIA;
const cities=[{lat:-3.119,lon:-60.022,timezone:'America/Manaus'},{lat:-36.85,lon:174.76,timezone:'Pacific/Auckland'},{lat:40.71,lon:-74,timezone:'America/New_York'}];
test('crepúsculo usa o mesmo dia e fonte solar; Lua pertence ao calendário da cidade',()=>{
 for(const city of cities) for(const date of ['2026-10-03','2026-11-01','2026-03-08']) {
  const at=time.parse(date+'T12:00',city),sky=create({sun,moon});sky.apply(0,1,null,city,at);
  const result=sky.astronomyAt(at),solar=sky.dayAt(at);
  assert.equal(result.date,date);assert.equal(result.rise,solar.rise);assert.equal(result.set,solar.set);
  assert.ok(result.dawn<result.rise);assert.ok(result.dusk>result.set);assert.equal(result.moonAvailable,true);
  for(const stamp of [result.moonRise,result.moonSet].filter(Number.isFinite)) {assert.equal(time.dayKey(stamp,city),date);assert.ok(stamp>=solar.start && stamp<solar.end);}
 }
});
test('Lua é calculada uma vez por dia municipal, com cache limitado e invalidado na troca de cidade',()=>{
 let count=0;const tracked={...moon,getMoonTimes(...args){count++;return moon.getMoonTimes(...args);}};
 const city=cities[0],at=time.parse('2026-10-03T12:00',city),sky=create({sun,moon:tracked});sky.apply(0,1,null,city,at);
 const first=sky.astronomyAt(at);const after=count;
 assert.deepEqual(sky.astronomyAt(at+30000),first);assert.equal(count,after);assert.equal(after,2);
 sky.astronomyAt(time.parse('2026-10-04T00:01',city));assert.equal(count,after+2);
 sky.apply(0,1,null,cities[1],at);assert.equal(sky.astronomyAt(at).date,time.dayKey(at,cities[1]));assert.ok(count>after+2);
});
test('filtra eventos UTC de ambos os lados do dia local e preserva meia-noite como evento',()=>{
 const city=cities[0],at=time.parse('2026-10-03T12:00',city),start=time.parse('2026-10-03T00:00',city),end=time.parse('2026-10-04T00:00',city);
 const fake={getMoonTimes(date){return date.getUTCDate()===3 ? {rise:new Date(start),set:new Date(start-1)} : {rise:new Date(end),set:new Date(end-3600000)};}};
 const sky=create({sun,moon:fake});sky.apply(0,1,null,city,at);
 const result=sky.astronomyAt(at);assert.equal(result.moonRise,start);assert.equal(result.moonSet,end-3600000);
});
test('falha de efeméride difere de ausência de evento no dia; não inventa horários polares',()=>{
 const city=cities[0],at=time.parse('2026-10-03T12:00',city);
 for(const moon of [{getMoonTimes(){throw Error('fail');}},{getMoonTimes(){return {};}}]) {
  const sky=create({sun,moon});sky.apply(0,1,null,city,at);const result=sky.astronomyAt(at);assert.equal(result.moonAvailable,false);assert.equal(result.moonRise,null);
 }
 const sky=create({sun,moon:{getMoonTimes:()=>({alwaysUp:true,alwaysDown:false})}});sky.apply(0,1,null,city,at);
 assert.equal(sky.astronomyAt(at).moonAvailable,true);assert.equal(sky.astronomyAt(at).moonRise,null);
 const polar=create({sun,moon});polar.apply(0,1,null,{lat:89,lon:0,timezone:'UTC'},Date.parse('2026-06-21T12:00Z'));
 assert.equal(polar.dayAt(Date.parse('2026-06-21T12:00Z')),null);
});
test('nascer/pôr da Lua calculados cruzam o horizonte, não dependem do tempo de abertura',()=>{
 const city=cities[0],at=time.parse('2026-10-04T12:00',city),sky=create({sun,moon});sky.apply(0,1,null,city,at);
 const result=sky.astronomyAt(at);assert.ok(Number.isFinite(result.moonRise));assert.ok(Number.isFinite(result.moonSet));
 for(const [stamp,sign] of [[result.moonRise,1],[result.moonSet,-1]]) {
  const before=moon.getMoonPosition(new Date(stamp-120000),city.lat,city.lon).altitude,after=moon.getMoonPosition(new Date(stamp+120000),city.lat,city.lon).altitude;
  assert.ok(sign*(after-before)>0);assert.ok(Math.abs(before)<2 && Math.abs(after)<2);
 }
 const next=create({sun,moon});next.apply(0,1,null,city,at+6*3600000);assert.equal(next.astronomyAt(at).moonRise,result.moonRise);
});
