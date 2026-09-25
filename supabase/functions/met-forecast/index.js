// Fonte secundária de previsão: MET Norway Locationforecast 2.0 (CC BY 4.0).
// Apenas coordenadas no Brasil, arredondadas para compartilhar o cache do provedor.
const SITE = 'https://pluviaweather.com.br';
const ORIGINS = new Set([SITE, 'https://luccamottaa.github.io']);
const PROVIDER = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const USER_AGENT = 'PLUVIA/1.0 (https://pluviaweather.com.br; https://github.com/luccamottaa/PLUVIA)';
const cache = new Map();
const attempts = new Map();

function originAllowed(origin) {
  return !origin || ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
function headers(origin, ttl = 0) {
  return {
    'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':origin || SITE,
    'Access-Control-Allow-Methods':'GET, OPTIONS',
    'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age':'86400',
    'Cache-Control':ttl ? `public, max-age=${ttl}, s-maxage=${ttl}` : 'no-store',
    'Vary':'Origin'
  };
}
function reply(origin, status, body, ttl = 0) {
  return new Response(JSON.stringify(body), {status,headers:headers(origin,ttl)});
}
function validCoordinate(value, min, max) {
  if (value === null || !/^-?\d{1,3}(?:\.\d{1,4})?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
function finite(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}
function normalize(data, now = Date.now()) {
  const series = data?.properties?.timeseries;
  if (!Array.isArray(series) || !series.length) throw new Error('invalid_provider_data');
  // A primeira hora futura, dentro de seis horas, representa o próximo instante previsto.
  const step = series.find(item => Number.isFinite(Date.parse(item?.time)) && Date.parse(item.time) >= now - 30 * 60_000);
  if (!step || Date.parse(step.time) > now + 6 * 3600_000) throw new Error('stale_provider_data');
  const instant = step.data?.instant?.details;
  const temperature = finite(instant?.air_temperature,-90,70);
  const wind = finite(instant?.wind_speed,0,120);
  if (temperature === null || wind === null) throw new Error('invalid_provider_data');
  const periods = [1,6,12];
  let precipitation = null;
  for (const hours of periods) {
    const amount = finite(step.data?.[`next_${hours}_hours`]?.details?.precipitation_amount,0,1000);
    if (amount !== null) { precipitation = {hours,amountMm:amount}; break; }
  }
  return {
    source:'MET Norway',
    time:step.time,
    temperatureC:temperature,
    windKmh:Math.round(wind * 36) / 10,
    precipitation,
    // Números do modelo global; sem chance de chuva ou rajadas onde a fonte não entrega.
    attribution:'Dados do MET Norway · CC BY 4.0'
  };
}

async function handle(req) {
  const origin = req.headers.get('origin') || '';
  if (!originAllowed(origin)) return reply(SITE,403,{error:'origin_not_allowed'});
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:headers(origin)});
  if (req.method !== 'GET') return reply(origin,405,{error:'method_not_allowed'});
  const url = new URL(req.url);
  const lat = validCoordinate(url.searchParams.get('lat'),-34,6);
  const lon = validCoordinate(url.searchParams.get('lon'),-74,-32);
  if (lat === null || lon === null) return reply(origin,400,{error:'invalid_location'});
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const stored = cache.get(key);
  if (stored && stored.until > Date.now()) return reply(origin,200,stored.data,Math.max(1,Math.floor((stored.until-Date.now())/1000)));
  const ip = req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || 'shared';
  const record = attempts.get(ip);
  const current = record && record.until > Date.now() ? record : {count:0,until:Date.now()+600_000};
  current.count += 1;
  attempts.set(ip,current);
  if (current.count > 30) return reply(origin,429,{error:'rate_limited'});
  // Limita a memória do processo; HTTP Cache-Control mantém a consulta reutilizável no cliente.
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  if (attempts.size > 500) attempts.delete(attempts.keys().next().value);
  const endpoint = new URL(PROVIDER);
  endpoint.searchParams.set('lat',lat.toFixed(2));
  endpoint.searchParams.set('lon',lon.toFixed(2));
  try {
    const response = await fetch(endpoint,{headers:{'User-Agent':USER_AGENT,'Accept':'application/json'},signal:AbortSignal.timeout(8500)});
    if (!response.ok) return reply(origin,502,{error:'provider_unavailable'});
    const payload = await response.json();
    const data = normalize(payload);
    const expiry = Date.parse(response.headers.get('expires') || '');
    const ttl = Math.max(0,Math.min(3600,Number.isFinite(expiry) ? Math.floor((expiry-Date.now())/1000) : 600));
    if (ttl) cache.set(key,{data,until:Date.now()+ttl*1000});
    return reply(origin,200,data,ttl);
  } catch {
    return reply(origin,502,{error:'provider_unavailable'});
  }
}

Deno.serve(handle);
