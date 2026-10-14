// Leitura das estações automáticas do INMET pelo nó WIS2 da OMM (dados "core", sem chave): a estação
// mais próxima das coordenadas de referência do município, só com leituras recentes e unidades
// conferidas. Usada por station-now (cartão "Medido agora") e push-process (aviso de chuva medida).
export const STATION_PROVIDER = 'https://wis2bra.inmet.gov.br/oapi/collections/urn:wmo:md:br-inmet:synop/items';
const RADIUS_KM = 30;           // estação mais longe que isso não representa a cidade
const MAX_AGE_MS = 150 * 60_000; // leitura com mais de 2h30 já não é "agora"
const FUTURE_MS = 15 * 60_000;

// Caixa de ~0,35° (≈ 39 km) em volta da cidade e só as últimas 3 horas (início arredondado em 10 min,
// para cidades iguais na mesma rodada dividirem a consulta).
export function stationUrl(lat, lon, now = Date.now(), pad = .35) {
  const endpoint = new URL(STATION_PROVIDER);
  endpoint.searchParams.set('f','json');
  endpoint.searchParams.set('bbox',[lon-pad,lat-pad,lon+pad,lat+pad].map(value => value.toFixed(3)).join(','));
  const since = Math.floor((now - 3 * 3600_000) / 600_000) * 600_000;
  endpoint.searchParams.set('datetime',`${new Date(since).toISOString().slice(0,19)}Z/..`);
  endpoint.searchParams.set('limit','600');
  return endpoint.href;
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

export function normalizeStation(data, lat, lon, now = Date.now()) {
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
  const hourRain = item => oneHour(item?.total_precipitation_or_total_water_equivalent?.period) ? finite(item.total_precipitation_or_total_water_equivalent?.value, 0, 300) : null;
  const rain = hourRain(report);
  // A hora anterior diz se a chuva acabou de começar (aviso de chuva medida).
  const previous = best.station.reports.get(best.time - 3600_000);
  const wind = finite(report.wind_speed?.value, 0, 100), gust = finite(report.maximum_wind_gust_speed?.value, 0, 120);
  const humidity = finite(report.relative_humidity?.value, 0, 100);
  return {
    source:'INMET',
    station:{ibge:stationIbge(best.station.id), distanceKm:Math.round(best.km * 10) / 10},
    time:new Date(best.time).toISOString(),
    temperatureC:Math.round(best.temperature * 10) / 10,
    humidity:humidity === null ? null : Math.round(humidity),
    rainMm:rain === null ? null : Math.round(rain * 10) / 10,
    previousRainMm:hourRain(previous) === null ? null : Math.round(hourRain(previous) * 10) / 10,
    windKmh:wind === null ? null : Math.round(wind * 3.6),
    gustKmh:gust === null ? null : Math.round(gust * 3.6),
    attribution:'INMET · estação automática (WIS2/OMM)'
  };
}

