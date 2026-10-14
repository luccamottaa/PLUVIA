// Última observação horária das estações automáticas do INMET, pelo nó WIS2 da OMM (dados "core",
// sem chave). O navegador não consegue chamar o nó direto (CORS duplicado), então esta função escolhe a
// estação mais próxima das coordenadas de referência do município e devolve só a leitura validada.
// Nada de GPS: o app manda as mesmas coordenadas municipais que já usa no Open-Meteo.
// Também devolve o boletim (METAR/SPECI) do aeroporto mais próximo: cobre as capitais sem estação do
// INMET no WIS2 (Aracaju, Boa Vista, Fortaleza, São Luís em outubro/2026) e relata chuva e trovoada
// observadas, inclusive nas proximidades. Uma fonte falhar não derruba a outra.
import { metarUrl, nearestAirport } from '../_shared/metar.js';
import { stationUrl, normalizeStation } from '../_shared/inmet-station.js';
const SITE = 'https://pluviaweather.com.br';
const ORIGINS = new Set([SITE, 'https://luccamottaa.github.io']);
const USER_AGENT = 'PLUVIA/1.0 (https://pluviaweather.com.br; https://github.com/luccamottaa/PLUVIA)';
const TTL_S = 600;
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
async function handle(req) {
  const origin = req.headers.get('origin') || '';
  if (!originAllowed(origin)) return reply(SITE,403,{error:'origin_not_allowed'});
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:headers(origin)});
  if (req.method !== 'GET') return reply(origin,405,{error:'method_not_allowed'});
  const url = new URL(req.url);
  const lat = validCoordinate(url.searchParams.get('lat'),-34,6);
  const lon = validCoordinate(url.searchParams.get('lon'),-74,-32);
  if (lat === null || lon === null) return reply(origin,400,{error:'invalid_location'});
  // Arredondado em ~1 km: cidades vizinhas e recargas dividem a mesma consulta por 10 min.
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const stored = cache.get(key);
  if (stored && stored.until > Date.now()) return reply(origin,200,stored.data,Math.max(1,Math.floor((stored.until-Date.now())/1000)));
  const ip = req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || 'shared';
  const record = attempts.get(ip);
  const current = record && record.until > Date.now() ? record : {count:0,until:Date.now()+600_000};
  current.count += 1;
  attempts.set(ip,current);
  if (current.count > 30) return reply(origin,429,{error:'rate_limited'});
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  if (attempts.size > 500) attempts.delete(attempts.keys().next().value);
  const now = Date.now();
  const station = fetch(stationUrl(lat, lon, now),{headers:{'User-Agent':USER_AGENT,'Accept':'application/geo+json, application/json'},signal:AbortSignal.timeout(8500)})
    .then(async response => { if (!response.ok) throw new Error('provider_unavailable'); return normalizeStation(await response.json(), lat, lon, now); });
  const airport = fetch(metarUrl(lat, lon),{headers:{'User-Agent':USER_AGENT,'Accept':'application/json'},signal:AbortSignal.timeout(8500)})
    .then(async response => { if (!response.ok) throw new Error('provider_unavailable'); return nearestAirport(await response.json(), lat, lon, now); });
  const [stationResult, airportResult] = await Promise.allSettled([station, airport]);
  // Sem nenhuma leitura e com o INMET fora: falha (não vira "sem estação").
  if (stationResult.status === 'rejected' && (airportResult.status === 'rejected' || !airportResult.value)) return reply(origin,502,{error:'provider_unavailable'});
  const data = {...(stationResult.status === 'fulfilled' ? stationResult.value : {source:'INMET', station:null}),
    airport:airportResult.status === 'fulfilled' ? airportResult.value : null};
  if (data.airport) data.airportAttribution = 'Boletim METAR do aeroporto (DECEA, via Aviation Weather Center/NOAA)';
  cache.set(key,{data,until:Date.now()+TTL_S*1000});
  return reply(origin,200,data,TTL_S);
}

Deno.serve(handle);
