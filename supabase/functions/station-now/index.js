// Última observação horária das estações automáticas do INMET, pelo nó WIS2 da OMM (dados "core",
// sem chave). O navegador não consegue chamar o nó direto (CORS duplicado), então esta função escolhe a
// estação mais próxima das coordenadas de referência do município e devolve só a leitura validada.
// Nada de GPS: o app manda as mesmas coordenadas municipais que já usa no Open-Meteo.
const SITE = 'https://pluviaweather.com.br';
const ORIGINS = new Set([SITE, 'https://luccamottaa.github.io']);
const PROVIDER = 'https://wis2bra.inmet.gov.br/oapi/collections/urn:wmo:md:br-inmet:synop/items';
const USER_AGENT = 'PLUVIA/1.0 (https://pluviaweather.com.br; https://github.com/luccamottaa/PLUVIA)';
const RADIUS_KM = 30;           // estação mais longe que isso não representa a cidade
const MAX_AGE_MS = 150 * 60_000; // leitura com mais de 2h30 já não é "agora"
const FUTURE_MS = 15 * 60_000;
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
function finite(value, min, max) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
// WIGOS do INMET: 0-76-0-<IBGE do município><sequência>.
function stationIbge(id) {
  const match = /^0-76-0-(\d{7})\d{1,12}$/.exec(String(id || ''));
  return match ? match[1] : null;
}
// Período de exatamente uma hora ("…/…" com 60 min), para a chuva não misturar acumulados de outro tamanho.
function oneHour(period) {
  const [start, end] = String(period || '').split('/').map(value => Date.parse(value));
  return Number.isFinite(start) && Number.isFinite(end) && end - start === 3600_000;
}

function normalize(data, lat, lon, now = Date.now()) {
  const features = data?.features;
  if (!Array.isArray(features)) throw new Error('invalid_provider_data');
  const stations = new Map();
  for (const feature of features) {
    const props = feature?.properties, coords = feature?.geometry?.coordinates;
    const id = props?.wigos_station_identifier, time = Date.parse(props?.reportTime);
    if (!stationIbge(id) || !Number.isFinite(time) || !Array.isArray(coords)) continue;
    const sLon = finite(coords[0], -75, -30), sLat = finite(coords[1], -35, 7);
    if (sLat === null || sLon === null) continue;
    if (time > now + FUTURE_MS || now - time > MAX_AGE_MS) continue;
    const station = stations.get(id) || {id, lat:sLat, lon:sLon, reports:new Map()};
    const report = station.reports.get(time) || {};
    report[props.name] = {value:props.value, period:props.phenomenonTime};
    station.reports.set(time, report);
    stations.set(id, station);
  }
  const candidates = [];
  for (const station of stations.values()) {
    const km = distanceKm(lat, lon, station.lat, station.lon);
    if (km > RADIUS_KM) continue;
    // A leitura mais recente com temperatura válida representa a estação.
    const times = [...station.reports.keys()].sort((a, b) => b - a);
    for (const time of times) {
      const report = station.reports.get(time);
      const temperature = finite(report.air_temperature?.value, -40, 60);
      if (temperature === null) continue;
      candidates.push({station, km, time, report, temperature});
      break;
    }
  }
  candidates.sort((a, b) => a.km - b.km || b.time - a.time);
  const best = candidates[0];
  if (!best) return {source:'INMET', station:null};
  const {report} = best;
  const rain = oneHour(report.total_precipitation_or_total_water_equivalent?.period) ? finite(report.total_precipitation_or_total_water_equivalent?.value, 0, 300) : null;
  const wind = finite(report.wind_speed?.value, 0, 100), gust = finite(report.maximum_wind_gust_speed?.value, 0, 120);
  const humidity = finite(report.relative_humidity?.value, 0, 100);
  return {
    source:'INMET',
    station:{ibge:stationIbge(best.station.id), distanceKm:Math.round(best.km * 10) / 10},
    time:new Date(best.time).toISOString(),
    temperatureC:Math.round(best.temperature * 10) / 10,
    humidity:humidity === null ? null : Math.round(humidity),
    rainMm:rain === null ? null : Math.round(rain * 10) / 10,
    windKmh:wind === null ? null : Math.round(wind * 3.6),
    gustKmh:gust === null ? null : Math.round(gust * 3.6),
    attribution:'INMET · estação automática (WIS2/OMM)'
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
  // Caixa de ~0,35° (≈ 39 km) em volta da cidade e só as últimas 3 horas.
  const now = Date.now(), pad = .35;
  const endpoint = new URL(PROVIDER);
  endpoint.searchParams.set('f','json');
  endpoint.searchParams.set('bbox',[lon-pad,lat-pad,lon+pad,lat+pad].map(value => value.toFixed(3)).join(','));
  endpoint.searchParams.set('datetime',`${new Date(now - 3 * 3600_000).toISOString().slice(0,19)}Z/..`);
  endpoint.searchParams.set('limit','600');
  try {
    const response = await fetch(endpoint,{headers:{'User-Agent':USER_AGENT,'Accept':'application/geo+json, application/json'},signal:AbortSignal.timeout(8500)});
    if (!response.ok) return reply(origin,502,{error:'provider_unavailable'});
    const data = normalize(await response.json(), lat, lon, now);
    cache.set(key,{data,until:Date.now()+TTL_S*1000});
    return reply(origin,200,data,TTL_S);
  } catch {
    return reply(origin,502,{error:'provider_unavailable'});
  }
}

Deno.serve(handle);
