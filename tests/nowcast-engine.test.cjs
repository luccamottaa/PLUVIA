const test=require('node:test'),assert=require('node:assert/strict');
const {evaluate,validateFrames,notificationCandidate,HORIZONS}=require('../supabase/functions/_shared/nowcast/engine.js');
const {fixture,frame,M,region}=require('./support/nowcast-fixtures.cjs');
const NOW=Date.UTC(2026,9,3,3,0);
const run=(scenario,alter)=>{const data=fixture(scenario,NOW,{mock:false});alter?.(data);return evaluate(data,{now:NOW});};
test('observed rain has a separate, uncertain motion inference and six horizons',()=>{
  const r=run('approaching');assert.equal(r.status,'APPROACHING');assert.equal(r.observation.kind,'observation');
  assert.equal(r.inference.kind,'inference');assert.equal(r.confidence.level,'MEDIUM');assert.equal(r.confidence.calibrated,false);
  assert.ok(r.observation.distanceKm>0);assert.ok(r.inference.arrival.latestMinutes>r.inference.arrival.earliestMinutes);
  assert.ok(r.inference.arrival.earliestMinutes%5===0);assert.ok(Math.abs(r.inference.bearingDegrees-270)<.001);
  assert.deepEqual(r.inference.projections.map(p=>p.minutes),HORIZONS);assert.equal(r.inference.projections.at(-1).confidence,'LOW');
});
test('no significant echoes is an observation, not a promise of dry next hour',()=>{
  const r=run('dry');assert.equal(r.status,'NO_SIGNIFICANT_RAIN');assert.equal(r.observation.significantRain,false);
  assert.equal(r.inference,null);assert.match(r.message,/horário do radar/);
});
test('stationary and departing rain never acquire an arrival time',()=>{
  assert.equal(run('stationary').status,'STATIONARY');assert.equal(run('stationary').inference.arrival,null);
  assert.equal(run('away').status,'MOVING_AWAY');assert.equal(run('away').inference.arrival,null);
});
test('new echo is only possible formation; no vector is manufactured',()=>{
  const r=run('forming');assert.equal(r.status,'FORMING');assert.equal(r.inference.arrival,null);assert.equal(r.confidence.level,'LOW');
  assert.match(r.inference.assumptions,/entrada na cobertura/);
});
test('intensification is inferred from quantitative radar, never a claim of lightning',()=>{
  const r=run('intensifying');assert.equal(r.inference.trend,'intensifying');assert.equal(r.observation.intensity,'strong');
  assert.equal(r.observation.lightning,undefined);
});
test('radar down and stale preserve station observations without an ETA',()=>{
  for(const scenario of ['radar-down','stale']) {const r=run(scenario);assert.equal(r.status,'INSUFFICIENT');assert.equal(r.inference,null);assert.equal(r.stations.length,1);}
});
test('satellite down leaves validated radar motion usable',()=>assert.equal(run('approaching').status,'APPROACHING'));
test('disagreeing fresh station rain prevents dry claims and cancels arrival',()=>{
  const r=run('discordant');assert.equal(r.confidence.level,'LOW');assert.equal(r.inference.arrival,null);
  assert.ok(r.confidence.reasons.includes('sources_disagree'));
  assert.equal(run('dry',d=>d.stations.observations[0].weather.rain='reported').status,'INSUFFICIENT');
});
test('outside configured pilot, outside actual grid and missing location are distinct',()=>{
  assert.equal(run('outside').status,'OUTSIDE_COVERAGE');assert.equal(run('no-location').status,'NO_LOCATION');
  assert.equal(run('approaching',d=>d.location.lat+=.4).status,'OUTSIDE_RADAR_COVERAGE');
});
test('missing radar coverage never becomes a zero or dry weather',()=>{
  for(const index of [0,2]) assert.equal(run('approaching',d=>d.radar.frames[index].values[0]=null).status,'INSUFFICIENT');
  assert.equal(run('dry',d=>d.radar.frames[2].coverageVerified=false).status,'INSUFFICIENT');
});
test('invalid quantities, coordinate systems and timestamps are rejected',()=>{
  const alterations=[f=>f.values[0]='0',f=>f.values[0]=NaN,f=>f.values[0]=-1,f=>f.units='dBZ',f=>f.crs='pixel',
    f=>f.observedAt=NOW+2*M,f=>f.ingestedAt=f.observedAt-2*M,f=>f.width=1,f=>f.bounds.west=f.bounds.east];
  for(const change of alterations) {const d=fixture('approaching',NOW,{mock:false});change(d.radar.frames[2]);assert.equal(validateFrames(d.radar,NOW),null);}
  const d=fixture('approaching',NOW,{mock:false});d.radar.frames[1].observedAt=d.radar.frames[0].observedAt;
  assert.equal(validateFrames(d.radar,NOW),null);
  d.radar.frames[1]=null;assert.equal(validateFrames(d.radar,NOW),null);
});
test('one or two frames and abrupt motion changes cannot acquire a trajectory',()=>{
  for(const count of [1,2]) {const r=run('approaching',d=>d.radar.frames=d.radar.frames.slice(-count));assert.equal(r.status,'NEARBY');assert.equal(r.inference,null);}
  const r=run('approaching',d=>d.radar.frames[1]=frame(NOW,12,35));assert.equal(r.inference,null);
});
test('incoming intersecting rain wins over a closer stationary area',()=>{
  const r=run('approaching',d=>d.radar.frames.forEach(f=>{
    for(let y=35;y<37;y++) for(let x=33;x<35;x++) f.values[y*f.width+x]=4;
  }));
  assert.equal(r.status,'APPROACHING');assert.ok(r.observation.distanceKm>8);assert.ok(r.inference.arrival);
});
test('moving toward the region but missing the reference never creates an ETA',()=>{
  const r=run('approaching',d=>d.radar.frames=[frame(NOW,22,48,40),frame(NOW,12,44,40),frame(NOW,2,40,40)]);
  assert.equal(r.status,'NEARBY');assert.equal(r.inference.arrival,null);
});
test('competing matches and coarse spatial resolution cannot acquire confident arrival',()=>{
  const r=run('approaching',d=>{const f=d.radar.frames[2];for(let y=33;y<35;y++)for(let x=45;x<47;x++)f.values[y*f.width+x]=4;});
  assert.equal(r.inference,null);assert.equal(r.confidence.level,'LOW');
  const coarse=run('approaching',d=>d.radar.frames.forEach(f=>{for(const key of ['north','south']) f.bounds[key]=region.center.lat+(f.bounds[key]-region.center.lat)*6;}));
  assert.equal(coarse.confidence.level,'LOW');assert.equal(coarse.inference.arrival,null);
});
test('station ingestion cannot renew expired observation validity',()=>{
  const r=run('radar-down',d=>{const s=d.stations.observations[0];s.observedAt=NOW-89*M;s.ingestedAt=NOW;s.validUntil=NOW+90*M;});
  assert.equal(r.stations.length,0);assert.equal(r.status,'INSUFFICIENT');
});
test('age reduces confidence and ETA measures from now, not the last frame',()=>{
  const fresh=run('approaching');const d=fixture('approaching',NOW,{mock:false});
  const older=evaluate(d,{now:NOW+4*M});assert.ok(older.confidence.score<fresh.confidence.score);
  assert.ok(older.inference.arrival.latestMinutes<=fresh.inference.arrival.latestMinutes);
  const late=evaluate(d,{now:NOW+10*M});assert.equal(late.confidence.level,'LOW');assert.equal(late.inference.arrival,null);
});
test('validity expires at age-based confidence boundaries',()=>{
 const d=fixture('approaching',NOW,{mock:false}),older=evaluate(d,{now:NOW+6*M});
 assert.equal(older.confidence.level,'MEDIUM');assert.equal(older.validUntil,d.radar.frames.at(-1).observedAt+10*M);
 const dry=run('dry');assert.equal(dry.validUntil,NOW+3*M);
 d.radar.quality.calibrated=true;d.radar.frames.unshift(frame(NOW,32,52));
 const high=evaluate(d,{now:d.radar.frames.at(-1).observedAt+1000});
 assert.equal(high.confidence.level,'HIGH');assert.equal(high.validUntil,d.radar.frames.at(-1).observedAt+.25*M);
});
test('forecast probability never participates in observation or confidence',()=>{
  const a=run('radar-down');const b=run('radar-down',d=>d.forecast={type:'forecast',kind:'model',status:'ready',rainProbability:100});
  assert.equal(a.status,b.status);assert.deepEqual(a.observation,b.observation);assert.deepEqual(a.confidence,b.confidence);
});
test('mocks are refused by default, explicitly branded in local development',()=>{
  const d=fixture('approaching',NOW);assert.equal(evaluate(d,{now:NOW}).status,'REJECTED_MOCK');
  const r=evaluate(d,{now:NOW,allowMock:true});assert.equal(r.mock,true);assert.equal(r.status,'APPROACHING');
});
test('alerts need calibrated results, persistent IDs, validity and deduplication',()=>{
  const r=run('approaching'),options={now:NOW,trackId:'track-1',stable:true};
  assert.equal(notificationCandidate(r,options),null);r.confidence.calibrated=true;
  const c=notificationCandidate(r,options);assert.ok(c);assert.equal(notificationCandidate(r,{...options,stable:false}),null);
  assert.equal(notificationCandidate(r,{...options,history:[{...c,sentAt:NOW-M}]}),null);
  assert.equal(notificationCandidate(r,{...options,trackId:'track-2',history:[{...c,sentAt:NOW-M}]}),null);
  assert.ok(notificationCandidate(r,{...options,history:[{...c,sentAt:NOW-7*3600000}]}));
  assert.equal(notificationCandidate({...r,mock:true},options),null);
  assert.equal(notificationCandidate(r,{...options,now:r.validUntil+1}),null);
});
