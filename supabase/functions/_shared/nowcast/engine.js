import {finite,within,distanceKm} from './regions.js';

export const HORIZONS = Object.freeze([15,30,45,60,90,120]);
const MINUTE=60000, MAX_AGE=15*MINUTE;
const validTime=(time,now)=>finite(time) && time>0 && time<=now+MINUTE;
const intensity=rate=>rate>=7.5 ? 'strong' : rate>=2.5 ? 'moderate' : 'light';
const local=(point,origin)=>({x:(point.lon-origin.lon)*111.32*Math.cos(origin.lat*Math.PI/180),y:(point.lat-origin.lat)*111.32});
const geographic=(point,origin)=>({lat:origin.lat+point.y/111.32,lon:origin.lon+point.x/(111.32*Math.cos(origin.lat*Math.PI/180))});
const norm=vector=>Math.hypot(vector.x,vector.y);
const separation=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

// Rows run north to south; values are rates in mm/h, never palette alpha or PoP.
export function validateFrames(radar,now) {
  if (radar?.kind!=='observation' || radar.status!=='ready' || !Array.isArray(radar.frames) || radar.frames.length<1 || radar.frames.length>6) return null;
  let previous=null;
  for (const frame of radar.frames) {
    if(!frame || typeof frame!=='object') return null;
    const b=frame.bounds;
    if (!validTime(frame.observedAt,now) || !validTime(frame.ingestedAt,now) || frame.ingestedAt<frame.observedAt-MINUTE ||
      frame.crs!=='EPSG:4326' || frame.units!=='mm/h' || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) ||
      frame.width<3 || frame.height<3 || frame.width>128 || frame.height>128 ||
      !b || ![b.north,b.south,b.east,b.west].every(finite) || b.south>=b.north || b.west>=b.east ||
      Math.max(Math.abs(b.north),Math.abs(b.south))>80 || Math.max(Math.abs(b.east),Math.abs(b.west))>180 ||
      b.north-b.south>8 || b.east-b.west>8 || !Array.isArray(frame.values) || frame.values.length!==frame.width*frame.height ||
      frame.values.some(value=>value!==null && (!finite(value) || value<0 || value>500))) return null;
    if (previous && (frame.observedAt<=previous.observedAt || frame.observedAt-previous.observedAt>20*MINUTE ||
      frame.observedAt-previous.observedAt<3*MINUTE || frame.width!==previous.width || frame.height!==previous.height ||
      ['north','south','east','west'].some(key=>b[key]!==previous.bounds[key]))) return null;
    previous=frame;
  }
  return radar.frames;
}

export function detectCells(frame,origin) {
  const {width,height,values,bounds}=frame, seen=new Uint8Array(values.length),cells=[];
  const stepX=(bounds.east-bounds.west)/width, stepY=(bounds.north-bounds.south)/height;
  const pixelRadius=Math.hypot(stepX*111.32*Math.cos(origin.lat*Math.PI/180),stepY*111.32)/2;
  for(let index=0;index<values.length;index++) {
    if(seen[index] || values[index]===null || values[index]<.5) continue;
    const queue=[index],points=[],rates=[];seen[index]=1;
    for(let cursor=0;cursor<queue.length;cursor++) {
      const at=queue[cursor],x=at%width,y=Math.floor(at/width);
      const point={lat:bounds.north-(y+.5)*stepY,lon:bounds.west+(x+.5)*stepX};
      points.push(local(point,origin));rates.push(values[at]);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx,ny=y+dy,n=ny*width+nx;
        if(nx<0 || nx>=width || ny<0 || ny>=height || seen[n] || values[n]===null || values[n]<.5) continue;
        seen[n]=1;queue.push(n);
      }
    }
    if(points.length<4) continue; // Suppress isolated echoes, not a meteorological QC substitute.
    const centroid={x:points.reduce((sum,p)=>sum+p.x,0)/points.length,y:points.reduce((sum,p)=>sum+p.y,0)/points.length};
    cells.push({centroid,points,pixelRadius,area:points.length,rate:rates.reduce((a,b)=>a+b,0)/rates.length,
      peak:Math.max(...rates),distanceKm:Math.max(0,Math.min(...points.map(norm))-pixelRadius)});
  }
  return cells.sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,30);
}

function previousCell(cell,currentCells,olderCells,minutes) {
  const candidates=olderCells.map(older=>({older,distance:separation(cell.centroid,older.centroid)}))
    .filter(({older,distance})=>distance<=100/60*minutes+cell.pixelRadius*2 && Math.max(cell.area,older.area)/Math.min(cell.area,older.area)<=2.5)
    .sort((a,b)=>a.distance-b.distance);
  const best=candidates[0];
  if(!best || candidates[1]?.distance<=best.distance+cell.pixelRadius*2) return null;
  // Splits/merges and competing tracks must not acquire a confident vector.
  if(currentCells.some(other=>other!==cell && separation(other.centroid,best.older.centroid)<=best.distance+cell.pixelRadius)) return null;
  return best.older;
}
function tracking(cell,sets,frames) {
  const chain=[cell];
  for(let i=sets.length-1;i>0;i--) {
    const previous=previousCell(chain[0],sets[i],sets[i-1],(frames[i].observedAt-frames[i-1].observedAt)/MINUTE);
    if(!previous) break;
    chain.unshift(previous);
  }
  if(chain.length<3) return {consistent:false,chain};
  const start=frames.length-chain.length,vectors=[];
  for(let i=1;i<chain.length;i++) {
    const minutes=(frames[start+i].observedAt-frames[start+i-1].observedAt)/MINUTE;
    vectors.push({x:(chain[i].centroid.x-chain[i-1].centroid.x)/minutes,y:(chain[i].centroid.y-chain[i-1].centroid.y)/minutes});
  }
  const vector={x:vectors.reduce((s,v)=>s+v.x,0)/vectors.length,y:vectors.reduce((s,v)=>s+v.y,0)/vectors.length};
  const speed=norm(vector),error=Math.max(...vectors.map(v=>separation(v,vector)));
  const stationary=vectors.every(v=>norm(v)*60<3);
  return {chain,vector,speedKmh:speed*60,error,stationary,
    consistent:stationary || speed*60<=100 && error<=Math.max(.05,speed*.35),
    trend:cell.rate>=chain[0].rate*1.25 ? 'intensifying' : cell.rate<=chain[0].rate*.75 ? 'weakening' : 'steady'};
}
function arrival(cell,track,ageMinutes) {
  if(!track.consistent || track.stationary || !track.vector) return null;
  const v=track.vector,a=v.x*v.x+v.y*v.y;
  if(a<=0) return null;
  let earliest=Infinity;
  for(const point of cell.points) {
    const p={x:point.x+v.x*ageMinutes,y:point.y+v.y*ageMinutes};
    const b=2*(p.x*v.x+p.y*v.y),c=p.x*p.x+p.y*p.y-cell.pixelRadius**2,disc=b*b-4*a*c;
    if(c<=0) {earliest=0;continue;}
    if(disc<0) continue;
    const enter=(-b-Math.sqrt(disc))/(2*a);
    if(enter>=0) earliest=Math.min(earliest,enter);
  }
  if(!finite(earliest) || earliest>120) return null;
  const uncertainty=Math.max(10,earliest*.3,ageMinutes,cell.pixelRadius/Math.max(norm(v),.05));
  return {earliestMinutes:Math.max(0,Math.floor((earliest-uncertainty)/5)*5),
    latestMinutes:Math.min(120,Math.ceil((earliest+uncertainty)/5)*5)};
}
function sourceState(provider,now) {
  return {id:provider?.id || provider?.type || 'unknown',type:provider?.type || 'unknown',
    name:provider?.source || 'Fonte indisponível',kind:provider?.kind || 'observation',
    status:provider?.status || 'unavailable',observedAt:validTime(provider?.observedAt,now)?provider.observedAt:null,
    ingestedAt:validTime(provider?.ingestedAt,now)?provider.ingestedAt:null,reason:provider?.reason || null};
}
function usableStations(provider,now,location) {
  if(provider?.kind!=='observation' || provider.status!=='ready' || !Array.isArray(provider.observations)) return [];
  return provider.observations.filter(s=>s?.kind==='observation' && validTime(s.observedAt,now) && now-s.observedAt<=90*MINUTE &&
    validTime(s.ingestedAt,now) && s.ingestedAt>=s.observedAt-MINUTE &&
    finite(s.validUntil) && s.validUntil<=s.observedAt+90*MINUTE && s.validUntil>=now && finite(s.lat) && finite(s.lon) &&
    Math.abs(s.lat)<=90 && Math.abs(s.lon)<=180 && typeof s.stationId==='string').slice(0,10)
    .map(s=>({...s,distanceKm:location ? Math.round(distanceKm(location,s)*10)/10 : null}));
}
function conflict(stations,frame,now) {
  return stations.some(s=>s.weather?.rain==='reported' && now-s.observedAt<10*MINUTE && within(s,frame.bounds) &&
    frame.values[Math.min(frame.height-1,Math.floor((frame.bounds.north-s.lat)/(frame.bounds.north-frame.bounds.south)*frame.height))*frame.width+
      Math.min(frame.width-1,Math.floor((s.lon-frame.bounds.west)/(frame.bounds.east-frame.bounds.west)*frame.width))]===0);
}
export function evaluate({location,region,radar,stations,satellite,lightning,forecast}={}, {now=Date.now(),allowMock=false}={}) {
  const providers=[radar,stations,satellite,lightning,forecast].filter(Boolean),mock=providers.some(p=>p.mock===true);
  const result={schemaVersion:1,regionId:region?.id || null,evaluatedAt:now,validUntil:now+5*MINUTE,mock,
    reference:location?.reference || 'municipality',location:location && finite(location.lat) && finite(location.lon)?{lat:location.lat,lon:location.lon}:null,
    status:'INSUFFICIENT',observation:null,inference:null,stations:[],sources:providers.map(p=>sourceState(p,now)),
    confidence:{level:'LOW',score:0,calibrated:false,reasons:['insufficient_radar']},eligibleForAlerts:false,
    message:'Dados insuficientes para um nowcast confiável neste momento.'};
  if(mock && !allowMock) {result.status='REJECTED_MOCK';return result;}
  if(!result.location) {result.status='NO_LOCATION';return result;}
  if(!region || !within(location,region.bounds)) {result.status='OUTSIDE_COVERAGE';return result;}
  result.stations=usableStations(stations,now,location);
  const frames=validateFrames(radar,now);
  if(!frames) return result;
  const last=frames.at(-1),age=Math.max(0,now-last.observedAt),ageMinutes=age/MINUTE;
  result.radar={source:radar.source,observedAt:last.observedAt,ingestedAt:last.ingestedAt,frameCount:frames.length};
  if(age>MAX_AGE) {result.confidence.reasons=['stale_radar'];return result;}
  result.validUntil=Math.min(result.validUntil,last.observedAt+MAX_AGE);
  if(!within(location,last.bounds)) {result.status='OUTSIDE_RADAR_COVERAGE';return result;}
  // Missing pixels are missing coverage. They are not dry echoes.
  if(frames.some(frame=>frame.values.some(value=>value===null) || frame.coverageVerified!==true) || radar.quality?.quantitative!==true) {
    result.confidence.reasons=['incomplete_coverage'];return result;
  }
  const sets=frames.map(frame=>detectCells(frame,location)),cells=sets.at(-1);
  const disagreement=conflict(result.stations,last,now);
  if(!cells.length) {
    if(frames.length<3 || disagreement) {result.confidence.reasons=[disagreement?'sources_disagree':'insufficient_frames'];return result;}
    result.status='NO_SIGNIFICANT_RAIN';result.message='Nenhuma área significativa de chuva foi detectada na cobertura analisada no horário do radar.';
    result.observation={kind:'observation',source:radar.source,observedAt:last.observedAt,significantRain:false};
    result.confidence={level:ageMinutes<=5?'MEDIUM':'LOW',score:ageMinutes<=5?55:30,calibrated:false,reasons:['no_future_dry_guarantee']};
    if(result.confidence.level==='MEDIUM') result.validUntil=Math.min(result.validUntil,last.observedAt+5*MINUTE);
    return result;
  }
  // Prefer an intersecting approach; nearest alone can overlook a more distant incoming cell.
  const candidates=cells.map(cell=>{const track=tracking(cell,sets,frames);return {cell,track,eta:arrival(cell,track,ageMinutes)};});
  const selected=candidates.filter(c=>c.eta).sort((a,b)=>a.eta.earliestMinutes-b.eta.earliestMinutes)[0] || candidates[0];
  const {cell,track,eta}=selected;
  result.observation={kind:'observation',source:radar.source,observedAt:last.observedAt,distanceKm:Math.round(cell.distanceKm),
    centroid:geographic(cell.centroid,location),rateMmH:Math.round(cell.rate*10)/10,intensity:intensity(cell.rate)};
  result.status='NEARBY';result.message='Área de precipitação detectada pelo radar.';
  if(track.chain.length<3) {
    result.confidence.reasons=['insufficient_frames_or_ambiguous_match'];
    if(frames.length>=3 && !sets[sets.length-2].length) {
      result.status='FORMING';
      result.inference={kind:'inference',algorithm:'new-echo-v1',arrival:null,projections:[],
        assumptions:'Um novo eco pode indicar formação de chuva ou entrada na cobertura. Não há movimento confirmado.'};
    }
    return result;
  }
  if(!track.consistent) {result.confidence.reasons=['inconsistent_motion'];return result;}
  const radial=cell.centroid.x*track.vector.x+cell.centroid.y*track.vector.y;
  result.status=track.stationary?'STATIONARY':eta?'APPROACHING':radial>0?'MOVING_AWAY':'NEARBY';
  let score=Math.max(0,Math.min(95,35+Math.min(20,frames.length*5)+20-Math.round(ageMinutes*2)+(cell.distanceKm<40?10:0)-(disagreement?40:0)));
  // HIGH requires independent regional validation; current algorithm is uncalibrated.
  const calibrated=radar.quality?.calibrated===true;
  const level=disagreement || ageMinutes>10 || cell.pixelRadius>3 || score<55 ? 'LOW' : calibrated && score>=85?'HIGH':'MEDIUM';
  result.confidence={level,score,calibrated,reasons:[...(!calibrated?['regional_validation_pending']:[]),...(disagreement?['sources_disagree']:[])]};
  // End validity at the next age-based confidence boundary, not after it.
  // Current HIGH score (max 85) becomes MEDIUM once rounded age penalty reaches 1.
  if(level!=='LOW') result.validUntil=Math.min(result.validUntil,last.observedAt+(level==='HIGH'?.25:10)*MINUTE);
  const bearing=track.stationary?null:(Math.atan2(track.vector.x,track.vector.y)*180/Math.PI+360)%360;
  result.inference={kind:'inference',algorithm:'linear-advection-v1',trend:track.trend,
    speedKmh:Math.round(track.speedKmh),bearingDegrees:bearing,
    arrival:level==='LOW' || track.stationary?null:eta,
    assumptions:'Deslocamento constante. Formação, dissipação e mudanças rápidas podem invalidar a projeção.',
    projections:track.stationary?[]:HORIZONS.map(minutes=>({minutes,
      ...geographic({x:cell.centroid.x+track.vector.x*(minutes+ageMinutes),y:cell.centroid.y+track.vector.y*(minutes+ageMinutes)},location),
      confidence:minutes>60?'LOW':level}))};
  if(disagreement) result.inference.arrival=null;
  return result;
}

// Preparation only. No call to Web Push. Stable IDs must come from persisted tracking.
export function notificationCandidate(result,{trackId,stable=false,history=[],now=Date.now()}={}) {
  if(!stable || typeof trackId!=='string' || !/^[a-zA-Z0-9:_-]{1,80}$/.test(trackId) || result?.mock ||
    result?.status!=='APPROACHING' || !result.confidence?.calibrated || !['MEDIUM','HIGH'].includes(result.confidence.level) ||
    result.validUntil<=now || !result.inference?.arrival || result.inference.arrival.latestMinutes>60) return null;
  const fingerprint=`nowcast:${result.regionId}:${trackId}:approaching`;
  if(history.some(prior=>finite(prior.sentAt) && now>=prior.sentAt &&
    (prior.fingerprint===fingerprint && now-prior.sentAt<6*3600000 ||
    prior.regionId===result.regionId && now-prior.sentAt<30*MINUTE))) return null;
  return {fingerprint,regionId:result.regionId,trackId,arrival:result.inference.arrival,type:'nowcast_approaching'};
}
