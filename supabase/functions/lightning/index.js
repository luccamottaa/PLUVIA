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
  const response = await fetch(`${DB}/rest/v1/${path}`,{...options,headers:{...dbHeaders(),...options.headers},signal:AbortSignal.timeout(5000)});
  if (!response.ok) throw new Error('database_unavailable');
  return response.status === 204 ? null : response.json();
}
function normalize(raw, checkedAt) {
  const noData = raw?.success === false && raw?.error?.code === 'warn_no_data' &&
    Array.isArray(raw.response) && raw.response.length === 0;
  if ((!noData && raw?.success !== true) || !Array.isArray(raw.response)) throw new Error('invalid_provider_data');
  const earliest = Math.floor(checkedAt / 1000) - 360;
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
  const hit = memory.get(key);
  if (hit?.until > now) return reply(origin,200,hit.data,Math.max(1,Math.floor((hit.until-now)/1000)));
  try {
    const rows = await database(`lightning_cache?location_key=eq.${encodeURIComponent(key)}&select=payload,expires_at&limit=1`);
    const row = rows?.[0], until = Date.parse(row?.expires_at || '');
    if (Number.isFinite(until) && until > now && row?.payload?.source === 'Vaisala Xweather') {
      memory.set(key,{data:row.payload,until});
      return reply(origin,200,row.payload,Math.max(1,Math.floor((until-now)/1000)));
    }
    const ip = req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || 'shared';
    const attempt = attempts.get(ip);
    const current = attempt?.until > now ? attempt : {count:0,until:now+300_000};
    current.count++; attempts.set(ip,current);
    if (attempts.size > 500) attempts.delete(attempts.keys().next().value);
    if (current.count > 5) return reply(origin,429,{error:'rate_limited'});
    const month = new Date(now).toISOString().slice(0,7)+'-01';
    const reserved = await database('rpc/reserve_lightning_call',{method:'POST',body:JSON.stringify({p_month:month,p_limit:MONTHLY_CAP})});
    if (reserved !== true) return reply(origin,429,{error:'monthly_limit'});
    const endpoint = new URL('https://data.api.xweather.com/lightning/closest');
    endpoint.searchParams.set('p',key);
    endpoint.searchParams.set('radius',`${RADIUS_KM}km`);
    endpoint.searchParams.set('limit','100');
    endpoint.searchParams.set('filter','all');
    endpoint.searchParams.set('client_id',CLIENT_ID);
    endpoint.searchParams.set('client_secret',CLIENT_SECRET);
    const response = await fetch(endpoint,{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(7000)});
    if (!response.ok) return reply(origin,502,{error:'provider_unavailable'});
    const data = normalize(await response.json(),Date.now());
    const expiresAt = new Date(Date.now()+CACHE_SECONDS*1000).toISOString();
    // Falha no cache não permite reaproveitar chamadas; não publica resposta até persistir.
    await database('lightning_cache?on_conflict=location_key',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({location_key:key,payload:data,expires_at:expiresAt})});
    memory.set(key,{data,until:Date.parse(expiresAt)});
    if (memory.size > 100) memory.delete(memory.keys().next().value);
    return reply(origin,200,data,CACHE_SECONDS);
  } catch {
    return reply(origin,503,{error:'temporarily_unavailable'});
  }
}

Deno.serve(handle);
