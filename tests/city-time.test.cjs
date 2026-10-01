const {test}=require('node:test'),assert=require('node:assert/strict');
const time=require('../dist/modules/city-time.js');
test('calendário e horários independem do fuso do dispositivo',()=>{
 const deviceZone=process.env.TZ;
 const outputs=['UTC','Asia/Tokyo','America/Los_Angeles'].map(TZ=>{
  process.env.TZ=TZ;
  return JSON.stringify([time.parse('2026-10-01T00:00','America/Manaus'),time.parse('2026-10-01T00:00','America/Noronha'),time.dayKey(Date.parse('2026-10-01T03:59:00Z'),'America/Manaus')]);
 });
 if(deviceZone===undefined) delete process.env.TZ; else process.env.TZ=deviceZone;
 assert.equal(new Set(outputs).size,1);
 assert.deepEqual(JSON.parse(outputs[0]),[Date.parse('2026-10-01T04:00Z'),Date.parse('2026-10-01T02:00Z'),'2026-09-30']);
});
test('hora atual avança na virada de dia e usa offsets explícitos',()=>{
 const times=['2026-09-30T23:00','2026-10-01T00:00','2026-10-01T01:00'];
 assert.equal(time.hourIndex(times,'America/Manaus',Date.parse('2026-10-01T03:59Z')),0);
 assert.equal(time.hourIndex(times,'America/Manaus',Date.parse('2026-10-01T04:00Z')),1);
 assert.equal(time.parse('2026-10-01T00:00:00-03:00','America/Manaus'),Date.parse('2026-10-01T03:00Z'));
 assert.equal(time.hourIndex([], 'UTC'),-1);
});
test('calcula offset na data solicitada e rejeita DST inexistente e datas inválidas',()=>{
 assert.equal(time.parse('2026-01-15T12:00','America/New_York'),Date.parse('2026-01-15T17:00Z'));
 assert.equal(time.parse('2026-07-15T12:00','America/New_York'),Date.parse('2026-07-15T16:00Z'));
 for(const value of ['2026-02-30T12:00','2026-10-01T24:00','2026-10-01T12:60','invalid']) assert.ok(Number.isNaN(time.parse(value,'UTC')));
 assert.ok(Number.isNaN(time.parse('2026-03-08T02:30','America/New_York')));
 assert.ok(Number.isNaN(time.parse('2026-10-01T12:00','Bad/Timezone')));
});
