// Raios observados, consultados apenas sob demanda. Nenhuma credencial chega ao navegador.
const SITE = 'https://pluviaweather.com.br';
const ORIGINS = new Set([SITE, 'https://luccamottaa.github.io']);
const DB = Deno.env.get('SUPABASE_URL');
const DB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const CLIENT_ID = Deno.env.get('XWEATHER_CLIENT_ID');
const CLIENT_SECRET = Deno.env.get('XWEATHER_CLIENT_SECRET');
const MONTHLY_CAP = 150; // Muito abaixo dos 15 mil acessos: /lightning tem multiplicador >=10x.
const CACHE_SECONDS = 300;
const RADIUS_KM = 40;
const memory = new Map();
const attempts = new Map();
const flights = new Map();

function allowed(origin) {
  return !origin || ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
function headers(origin, ttl = 0) {
  return {'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':origin || SITE,
    'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods':'GET, OPTIONS',
    'Access-Control-Max-Age':'86400', 'Vary':'Origin',
    'Cache-Control':ttl ? `public, max-age=${ttl}, s-maxage=${ttl}` : 'no-store'};
}
function reply(origin, status, body, ttl = 0) {
  return new Response(JSON.stringify(body),{status,headers:headers(origin,ttl)});
}
function coordinate(value, min, max) {
  if (value === null || !/^-?\d{1,3}(?:\.\d{1,4})?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
function dbHeaders() {
  return {'apikey':DB_KEY,'Authorization':`Bearer ${DB_KEY}`,'Content-Type':'application/json'};
}
async function database(path, options = {}) {
  try {
    const response = await fetch(`${DB}/rest/v1/${path}`,{...options,headers:{...dbHeaders(),...options.headers},signal:AbortSignal.timeout(5000)});
    if (!response.ok) {
      const stage=path.startsWith('rpc/') ? 'budget_reserve' : options.method === 'POST' ? 'cache_write' : 'cache_read';
      let databaseCode;
      try {
        const raw=await response.json();
        if(['42501','42P01','PGRST002','PGRST003','PGRST106','PGRST202','PGRST205','PGRST301','PGRST302'].includes(raw?.code)) databaseCode=raw.code;
      } catch {}
      console.warn(JSON.stringify({component:'lightning',code:'database_unavailable',stage,status:response.status,...(databaseCode ? {database_code:databaseCode} : {})}));
      throw new Error('database_unavailable');
    }
    // PostgREST upsert with return=minimal can be 200, 201 or 204 with an empty body.
    const minimal = options.headers?.Prefer?.split(',').includes('return=minimal');
    return response.status === 204 || minimal ? null : await response.json();
  } catch { throw new Error('database_unavailable'); }
}
function normalize(raw, checkedAt) {
  const noData = raw?.success === false && raw?.error?.code === 'warn_no_data' &&
    Array.isArray(raw.response) && raw.response.length === 0;
  if (raw?.success === false && ['unauthorized','invalid_client','insufficient_scope','unauthorized_namespace'].includes(raw?.error?.code)) throw new Error('provider_not_authorized');
  if (raw?.success === false && ['maxhits','maxhits_min'].includes(raw?.error?.code)) throw new Error('provider_rate_limited');
  if ((!noData && raw?.success !== true) || !Array.isArray(raw.response)) throw new Error('invalid_provider_data');
  const earliest = Math.floor(checkedAt / 1000) - 300;
  const events = raw.response.slice(0,100).map(item => {
    const latitude = item?.loc?.lat, longitude = item?.loc?.long;
    const time = item?.ob?.timestamp, type = String(item?.ob?.pulse?.type || '').toUpperCase();
    const distanceKm = item?.relativeTo?.distanceKM;
    if (![latitude,longitude,time,distanceKm].every(Number.isFinite) ||
      latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 ||
      time < earliest || time > Math.floor(checkedAt / 1000) + 60 ||
      distanceKm < 0 || distanceKm > RADIUS_KM + 2 || !['CG','IC'].includes(type)) throw new Error('invalid_provider_data');
    return {lat:latitude,lon:longitude,time,type,distanceKm:Math.round(distanceKm * 10)/10};
  });
  return {source:'Vaisala Xweather',checkedAt,windowMinutes:5,radiusKm:RADIUS_KM,
    truncated:raw.response.length >= 100,events};
}
function cachedPayload(payload, now) {
  if (payload?.source !== 'Vaisala Xweather' || !Number.isFinite(payload.checkedAt) ||
    now-payload.checkedAt > CACHE_SECONDS*1000 || payload.checkedAt-now > 60_000 ||
    payload.windowMinutes !== 5 || payload.radiusKm !== RADIUS_KM ||
    typeof payload.truncated !== 'boolean' || !Array.isArray(payload.events) || payload.events.length > 100) return null;
  try {
    // Reuse provider validation and rebuild the public allowlist, including cached rows.
    const safe = normalize({success:true,response:payload.events.map(event=>({
      loc:{lat:event?.lat,long:event?.lon},ob:{timestamp:event?.time,pulse:{type:event?.type}},
      relativeTo:{distanceKM:event?.distanceKm}
    }))},payload.checkedAt);
    safe.truncated=payload.truncated;
    return safe;
  } catch { return null; }
}
async function load(key, now, ip) {
  const hit = memory.get(key), safeHit = cachedPayload(hit?.data,now);
  if (hit?.until > now && safeHit) return {status:200,body:safeHit,ttl:Math.max(1,Math.floor((hit.until-now)/1000))};
  try {
    const rows = await database(`lightning_cache?location_key=eq.${encodeURIComponent(key)}&select=payload,expires_at&limit=1`);
    const row = rows?.[0], until = Math.min(Date.parse(row?.expires_at || ''),now+CACHE_SECONDS*1000,row?.payload?.checkedAt+CACHE_SECONDS*1000);
    const safe = cachedPayload(row?.payload,now);
    if (Number.isFinite(until) && until > now && safe) {
      memory.set(key,{data:safe,until});
      if (memory.size > 100) memory.delete(memory.keys().next().value);
      return {status:200,body:safe,ttl:Math.max(1,Math.floor((until-now)/1000))};
    }
    const attempt = attempts.get(ip);
    const current = attempt?.until > now ? attempt : {count:0,until:now+300_000};
    current.count++; attempts.set(ip,current);
    if (attempts.size > 500) attempts.delete(attempts.keys().next().value);
    if (current.count > 5) return {status:429,body:{error:'rate_limited'}};
    const month = new Date(now).toISOString().slice(0,7)+'-01';
    const reserved = await database('rpc/reserve_lightning_call',{method:'POST',body:JSON.stringify({p_month:month,p_limit:MONTHLY_CAP})});
    if (reserved !== true) return {status:429,body:{error:'monthly_limit'}};
    const endpoint = new URL('https://data.api.xweather.com/lightning/closest');
    endpoint.searchParams.set('p',key);
    endpoint.searchParams.set('radius',`${RADIUS_KM}km`);
    endpoint.searchParams.set('limit','100');
    endpoint.searchParams.set('filter','all');
    endpoint.searchParams.set('from','-5minutes');
    endpoint.searchParams.set('to','now');
    endpoint.searchParams.set('client_id',CLIENT_ID);
    endpoint.searchParams.set('client_secret',CLIENT_SECRET);
    let response,raw;
    try {
      response = await fetch(endpoint,{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(7000)});
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'provider_not_authorized' : response.status === 429 ? 'provider_rate_limited' : 'provider_unavailable');
      try { raw=await response.json(); } catch { throw new Error('invalid_provider_data'); }
    } catch (error) {
      const code=['provider_not_authorized','provider_rate_limited','invalid_provider_data'].includes(error?.message) ? error.message : 'provider_unavailable';
      throw new Error(code);
    }
    const data = normalize(raw,Date.now());
    const expiresAt = new Date(Date.now()+CACHE_SECONDS*1000).toISOString();
    // Falha no cache não permite reaproveitar chamadas; não publica resposta até persistir.
    await database('lightning_cache?on_conflict=location_key',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({location_key:key,payload:data,expires_at:expiresAt})});
    memory.set(key,{data,until:Date.parse(expiresAt)});
    if (memory.size > 100) memory.delete(memory.keys().next().value);
    return {status:200,body:data,ttl:CACHE_SECONDS};
  } catch (error) {
    const code=['database_unavailable','provider_not_authorized','provider_rate_limited','provider_unavailable','invalid_provider_data'].includes(error?.message) ? error.message : 'temporarily_unavailable';
    console.warn(JSON.stringify({component:'lightning',code}));
    return {status:503,body:{error:code}};
  }
}

async function handle(req) {
  const origin = req.headers.get('origin') || '';
  if (!allowed(origin)) return reply(SITE,403,{error:'origin_not_allowed'});
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:headers(origin)});
  if (req.method !== 'GET') return reply(origin,405,{error:'method_not_allowed'});
  const url = new URL(req.url);
  const lat = coordinate(url.searchParams.get('lat'),-34,6);
  const lon = coordinate(url.searchParams.get('lon'),-74,-32);
  if (lat === null || lon === null) return reply(origin,400,{error:'invalid_location'});
  if (!CLIENT_ID || !CLIENT_SECRET || !DB || !DB_KEY) return reply(origin,503,{error:'not_configured'});
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const now = Date.now();
  // Coalesce same-city work without sharing response bodies or CORS headers.
  let task = flights.get(key);
  if (!task) {
    if (flights.size >= 100) return reply(origin,429,{error:'rate_limited'});
    task=load(key,now,req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || 'shared').finally(()=>{if(flights.get(key)===task)flights.delete(key);});
    flights.set(key,task);
  }
  const result=await task;
  return reply(origin,result.status,result.body,result.ttl || 0);
}

Deno.serve(handle);
