import {finite} from './regions.js';
const MINUTE=60000;
export const AWC_URL='https://aviationweather.gov/api/data/metar';
const number=(value,min,max)=>finite(value) && value>=min && value<=max ? value : null;

export function metarWeather(value) {
  if(value==null) return {rain:'not_reported',thunderstorm:'not_reported',intensity:null};
  if(typeof value!=='string' || value.length>100 || !/^[A-Z+\- ]*$/.test(value)) throw new Error('invalid_response');
  const tokens=value.split(/ +/).filter(Boolean),rain=tokens.find(t=>/RA|DZ/.test(t));
  const thunder=tokens.find(t=>t.includes('TS'));
  return {rain:rain?(rain.startsWith('VC')?'vicinity':'reported'):'not_reported',
    thunderstorm:thunder?(thunder.startsWith('VC')?'vicinity':'reported'):'not_reported',
    intensity:!rain || rain.startsWith('VC') ? null : rain.startsWith('+')?'strong':rain.startsWith('-')?'light':'moderate'};
}
export function normalizeMetar(rows,region,ingestedAt=Date.now()) {
  if(!Array.isArray(rows) || rows.length>20) throw new Error('invalid_response');
  const observations=[];
  for(const raw of rows) {
    if(!region.stations.includes(raw?.icaoId) || raw?.metarType!=='METAR' && raw?.metarType!=='SPECI' ||
      !finite(raw?.obsTime) || !Number.isInteger(raw.obsTime) || raw.obsTime<=0 || raw.obsTime*1000>ingestedAt+MINUTE ||
      number(raw.lat,-90,90)===null || number(raw.lon,-180,180)===null) throw new Error('invalid_response');
    const observedAt=raw.obsTime*1000;
    // No fallback to receiptTime/ingestion for an invalid or old observation.
    if(ingestedAt-observedAt>90*MINUTE) continue;
    observations.push({kind:'observation',stationId:raw.icaoId,name:raw.icaoId==='SBEG'?'Aeroporto Eduardo Gomes':raw.icaoId,
      source:'NOAA Aviation Weather Center · METAR',lat:raw.lat,lon:raw.lon,observedAt,ingestedAt,validUntil:observedAt+90*MINUTE,
      temperatureC:number(raw.temp,-90,70),dewPointC:number(raw.dewp,-100,70),
      windKmh:number(raw.wspd,0,250)===null?null:Math.round(raw.wspd*1.852*10)/10,
      gustKmh:number(raw.wgst,0,300)===null?null:Math.round(raw.wgst*1.852*10)/10,
      windFromDegrees:number(raw.wdir,0,360),altimeterHpa:number(raw.altim,850,1100),
      weather:metarWeather(raw.wxString),quality:'unverified_station_report'});
  }
  // Latest report per station. Duplicate queries must not fabricate a time series.
  return [...new Map(observations.sort((a,b)=>a.observedAt-b.observedAt).map(s=>[s.stationId,s])).values()];
}
export class WeatherStationProvider {
  constructor({fetchImpl=fetch,clock=Date.now}={}) {this.fetchImpl=fetchImpl;this.clock=clock;}
  async read(region,{signal}={}) {
    const url=new URL(AWC_URL);url.searchParams.set('ids',region.stations.join(','));url.searchParams.set('format','json');
    const response=await this.fetchImpl(url.href,{signal,headers:{'User-Agent':'PLUVIA/1.0 (+https://pluviaweather.com.br; Manaus observations)','Accept':'application/json'}});
    if(!response.ok) throw new Error(response.status===429?'rate_limited':'provider_unavailable');
    let rows=[];
    if(response.status!==204) {
      try { rows=await response.json(); } catch { throw new Error('invalid_response'); }
    }
    const ingestedAt=this.clock();
    const observations=normalizeMetar(rows,region,ingestedAt);
    return {id:'awc-metar',type:'stations',source:'NOAA Aviation Weather Center · METAR',kind:'observation',
      status:observations.length?'ready':'unavailable',observedAt:observations.length?Math.max(...observations.map(s=>s.observedAt)):null,
      ingestedAt,reason:observations.length?null:'no_recent_station_report',observations};
  }
}
export class RadarProvider {
  async read(region) {return {id:region.radar.id,type:'radar',source:region.radar.name,kind:'observation',status:'not_configured',
    reason:'authorized_quantitative_feed_required',observedAt:null,ingestedAt:null,frames:[]};}
}
export class SatelliteProvider {
  async read() {return {id:'goes',type:'satellite',source:'GOES-East · NOAA / NASA GIBS',kind:'observation',status:'visual_only',
    reason:'geocolor_is_not_cloud_top_temperature',observedAt:null,ingestedAt:null};}
}
export class LightningProvider {
  async read() {return {id:'xweather',type:'lightning',source:'Vaisala Xweather',kind:'observation',status:'on_demand',
    reason:'existing_map_budget_preserved',observedAt:null,ingestedAt:null};}
}
export class ForecastProvider {
  async read() {return {id:'forecast',type:'forecast',source:'Previsão tradicional do PLUVIA',kind:'model',status:'context_only',
    reason:'excluded_from_observation_engine',observedAt:null,ingestedAt:null};}
}

export function createCollector({fetchImpl=fetch,clock=Date.now,timeoutMs=8000,providers}={}) {
  const entries=providers || [new RadarProvider(),new WeatherStationProvider({fetchImpl,clock}),new SatelliteProvider(),new LightningProvider(),new ForecastProvider()];
  const keys=['radar','stations','satellite','lightning','forecast'];
  return async region=>{
    const tasks=entries.map(async (provider,index)=>{
      const controller=new AbortController();let timer;
      try {
        const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('timeout'));},timeoutMs);});
        return await Promise.race([provider.read(region,{signal:controller.signal}),deadline]);
      } catch(error) {
        const reason=['timeout','invalid_response','rate_limited'].includes(error?.message)?error.message:'provider_unavailable';
        return {id:keys[index],type:keys[index],source:index===1?'NOAA Aviation Weather Center · METAR':keys[index],kind:index===4?'model':'observation',
          status:'unavailable',reason,observedAt:null,ingestedAt:clock()};
      } finally {clearTimeout(timer);}
    });
    const values=await Promise.all(tasks);
    return Object.fromEntries(values.map((value,index)=>[keys[index],value]));
  };
}
