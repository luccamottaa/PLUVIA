import {REGIONS,within} from './regions.js';
import {evaluate} from './engine.js';
import {createCollector} from './providers.js';

const SITE='https://pluviaweather.com.br',TTL=300000,FAILURE_TTL=60000;
const allowed=origin=>!origin || origin===SITE || origin==='https://luccamottaa.github.io' || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
export function createHandler({collect=createCollector(),clock=Date.now}={}) {
  // Regional source cache, independent of the selected point. Bounded by REGIONS.
  const cache=new Map(),flights=new Map();
  async function bundle(region) {
    const saved=cache.get(region.id);
    if(saved && saved.expiresAt>clock()) return saved.value;
    if(flights.has(region.id)) return flights.get(region.id);
    const task=Promise.resolve().then(()=>collect(region)).then(value=>{
      cache.set(region.id,{value,expiresAt:clock()+(value.stations?.status==='ready'?TTL:FAILURE_TTL)});return value;
    }).finally(()=>flights.delete(region.id));
    flights.set(region.id,task);return task;
  }
  return async req=>{
    const origin=req.headers.get('origin') || '',url=new URL(req.url);
    const headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':origin || SITE,
      'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'apikey, authorization, x-client-info',
      'Vary':'Origin','Cache-Control':'no-store'};
    const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
    if(!allowed(origin)) return new Response(null,{status:403});
    if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
    if(req.method!=='GET') return reply({error:'method_not_allowed'},405);
    if(url.search.length>200 || [...url.searchParams.keys()].some(key=>!['region','lat','lon'].includes(key) || url.searchParams.getAll(key).length!==1)) return reply({error:'invalid_request'},400);
    if(!url.search) {
      headers['Cache-Control']='public, max-age=3600, s-maxage=3600';
      return reply({schemaVersion:1,regions:REGIONS.map(({id,name,center,bounds})=>({id,name,center,bounds}))});
    }
    const region=REGIONS.find(r=>r.id===url.searchParams.get('region'));
    if(!region) return reply({error:'unsupported_region'},400);
    const parse=(key,min,max)=>{const s=url.searchParams.get(key);if(s===null) return null;
      return /^-?\d{1,3}(?:\.\d{1,2})?$/.test(s) && Number(s)>=min && Number(s)<=max?Number(s):NaN;};
    const lat=parse('lat',-90,90),lon=parse('lon',-180,180);
    if(Number.isNaN(lat) || Number.isNaN(lon) || (lat===null)!==(lon===null)) return reply({error:'invalid_location'},400);
    const location={...(lat===null?region.center:{lat,lon}),reference:'municipality'};
    try {
      const data=within(location,region.bounds)?await bundle(region):{};
      const result=evaluate({...data,location,region},{now:clock(),allowMock:false});
      // Query is a municipal reference, never account data or device GPS.
      headers['Cache-Control']='public, max-age=60, s-maxage=60';
      return reply(result);
    } catch {
      // Fixed diagnostic only: no provider URL, payload, IP or coordinates.
      console.warn(JSON.stringify({component:'nowcast',code:'collection_failed'}));
      return reply({error:'provider_unavailable'},503);
    }
  };
}
