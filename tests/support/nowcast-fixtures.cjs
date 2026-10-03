// Synthetic regular grids. Not part of dist/, the service worker or production providers.
const {REGIONS}=require('../../supabase/functions/_shared/nowcast/regions.js');
const M=60000,region=REGIONS[0];
const bounds={south:region.center.lat-.3,north:region.center.lat+.3,west:region.center.lon-.3,east:region.center.lon+.3};
function frame(now,minutes,x=45,y=29,rate=4) {
  const width=60,height=60,values=Array(width*height).fill(0);
  if(x!==null) for(let row=y;row<y+2;row++) for(let col=x;col<x+2;col++) values[row*width+col]=rate;
  return {observedAt:now-minutes*M,ingestedAt:now-minutes*M+1000,crs:'EPSG:4326',units:'mm/h',width,height,bounds:{...bounds},values,coverageVerified:true};
}
function fixture(scenario='approaching',now=Date.now(),{mock=true}={}) {
  const location={...region.center,reference:'municipality'};
  const radar={id:'dev-radar',type:'radar',kind:'observation',source:mock?'DEV / MOCK DATA':'Test quantitative source',status:'ready',mock,
    quality:{quantitative:true,calibrated:false},frames:[frame(now,22,48),frame(now,12,44),frame(now,2,40)]};
  const stations={id:'awc-metar',type:'stations',kind:'observation',source:mock?'DEV / MOCK DATA':'NOAA Aviation Weather Center · METAR',status:'ready',mock,
    observations:[{kind:'observation',stationId:'SBEG',name:'Aeroporto Eduardo Gomes',source:mock?'DEV / MOCK DATA':'NOAA Aviation Weather Center · METAR',
      lat:-3.039,lon:-60.05,observedAt:now-5*M,ingestedAt:now-4*M,validUntil:now+85*M,temperatureC:27,dewPointC:24,
      windKmh:8,gustKmh:null,windFromDegrees:90,altimeterHpa:1010,weather:{rain:'not_reported',thunderstorm:'not_reported',intensity:null},quality:'unverified_station_report'}]};
  if(scenario==='dry') radar.frames=[frame(now,22,null),frame(now,12,null),frame(now,2,null)];
  if(scenario==='stationary') radar.frames=[frame(now,22,40),frame(now,12,40),frame(now,2,40)];
  if(scenario==='away') radar.frames=[frame(now,22,32),frame(now,12,36),frame(now,2,40)];
  if(scenario==='forming') radar.frames=[frame(now,22,null),frame(now,12,null),frame(now,2,40)];
  if(scenario==='intensifying') radar.frames=[frame(now,22,48,29,2),frame(now,12,44,29,4),frame(now,2,40,29,9)];
  if(scenario==='radar-down') {radar.status='unavailable';radar.frames=[];}
  if(scenario==='stale') radar.frames.forEach(f=>{f.observedAt-=20*M;f.ingestedAt-=20*M;});
  if(scenario==='discordant') {const station=stations.observations[0];station.weather.rain='reported';}
  if(scenario==='outside') location.lon=-46.63;
  const satellite={id:'goes',type:'satellite',source:'GOES',kind:'observation',status:'unavailable',observedAt:null};
  return {region,location:scenario==='no-location'?null:location,radar,stations,satellite};
}
module.exports={fixture,frame,M,region};
