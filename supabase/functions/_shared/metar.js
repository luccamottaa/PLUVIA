// Boletins METAR/SPECI dos aeroportos (pedido do usuário, outubro/2026), pela API pública do
// Aviation Weather Center (NOAA), que repassa os boletins do DECEA sem chave. Todo aeroporto de capital
// emite METAR de hora em hora e SPECI quando o tempo muda (por exemplo, quando a trovoada chega).
// Em Manaus, 13/10/2026, os dois aeroportos relataram TS/TSRA entre 01h e 03h e VCTS/SHRA ao meio-dia,
// quando os modelos diziam nublado. Funções puras: quem chama faz o fetch.
export const METAR_ENDPOINT = 'https://aviationweather.gov/api/data/metar';
export const AIRPORT_RADIUS_KM = 35;      // Natal (SBSG) fica a ~25 km do centro
export const AIRPORT_MAX_AGE_MS = 75 * 60_000; // METAR horário + folga; SPECI chega no meio da hora
const FUTURE_MS = 15 * 60_000;

// Caixa de ~0,35° em volta da cidade: em caixas grandes a API devolve só parte dos aeroportos.
export function metarUrl(lat, lon, hours = 2, pad = .35) {
  // Vírgulas literais, como na documentação da API (URLSearchParams as codificaria).
  const bbox = [lat - pad, lon - pad, lat + pad, lon + pad].map(value => value.toFixed(2)).join(',');
  return `${METAR_ENDPOINT}?bbox=${bbox}&format=json&hours=${Math.max(1, Math.min(6, Math.round(hours)))}`;
}

// Tempo presente do METAR ("-TSRA", "+SHRA", "VCTS VCSH", "-DZ BR"…). Só chuva, garoa e trovoada importam
// aqui; "VC" é nas proximidades (8 a 16 km), não no aeroporto.
export function parseWeather(wx) {
  const result = {rain:null, showers:false, drizzle:false, thunder:false, nearbyShowers:false, nearbyThunder:false};
  const order = ['light', 'moderate', 'heavy'];
  for (const raw of String(wx || '').trim().split(/\s+/)) {
    const token = raw.toUpperCase();
    if (!/^[+-]?[A-Z]{2,12}$/.test(token)) continue;
    if (token.startsWith('VC')) {
      if (token.includes('TS')) result.nearbyThunder = true;
      if (token.includes('SH')) result.nearbyShowers = true;
      continue;
    }
    const body = token.replace(/^[+-]/, '');
    const intensity = token[0] === '-' ? 'light' : token[0] === '+' ? 'heavy' : 'moderate';
    if (body.includes('TS')) result.thunder = true;
    if (/RA/.test(body)) {
      if (!result.rain || order.indexOf(intensity) > order.indexOf(result.rain)) result.rain = intensity;
      if (body.includes('SH')) result.showers = true;
    } else if (/DZ/.test(body)) result.drizzle = true;
  }
  return result;
}

// Visibilidade horizontal do boletim, em metros, logo depois do grupo de vento ("… 04005KT 9999 …").
// 9999 e CAVOK querem dizer 10 km ou mais (plus); o campo visib da API vem em milhas e é arredondado.
export function parseVisibility(raw) {
  const match = /\s(?:\d{3}|VRB)\d{2,3}(?:G\d{2,3})?(?:KT|MPS)(?:\s\d{3}V\d{3})?\s(CAVOK|\d{4})(?:NDV)?(?=\s|$)/.exec(String(raw || ''));
  if (!match) return null;
  if (match[1] === 'CAVOK' || match[1] === '9999') return {meters:10000, plus:true};
  const meters = Number(match[1]);
  return Number.isFinite(meters) && meters >= 0 && meters < 9999 ? {meters, plus:false} : null;
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
// Umidade relativa pela fórmula de Magnus (temperatura e ponto de orvalho em °C).
function humidity(temp, dew) {
  if (temp === null || dew === null || dew > temp + .5) return null;
  const e = t => Math.exp(17.625 * t / (243.04 + t));
  return Math.max(0, Math.min(100, Math.round(100 * e(dew) / e(temp))));
}

// Aeroporto mais próximo com boletim recente (perto da fronteira pode ser de um país vizinho); o boletim
// anterior do mesmo aeroporto diz se a chuva acabou de começar. O nome do aeroporto não sai: a base traz
// nomes sem acento e às vezes o estado errado.
export function nearestAirport(list, lat, lon, now = Date.now(), {radiusKm = AIRPORT_RADIUS_KM, maxAgeMs = AIRPORT_MAX_AGE_MS} = {}) {
  if (!Array.isArray(list)) return null;
  const airports = new Map();
  for (const item of list) {
    const icao = String(item?.icaoId || '');
    const at = finite(item?.obsTime, 1e9, 1e10) === null ? NaN : item.obsTime * 1000;
    const aLat = finite(item?.lat, -35, 7), aLon = finite(item?.lon, -75, -30);
    if (!/^[A-Z][A-Z0-9]{3}$/.test(icao) || !Number.isFinite(at) || aLat === null || aLon === null) continue;
    if (at > now + FUTURE_MS) continue;
    const entry = airports.get(icao) || {icao, lat:aLat, lon:aLon, reports:[]};
    entry.reports.push({at, item});
    airports.set(icao, entry);
  }
  const candidates = [];
  for (const airport of airports.values()) {
    const km = distanceKm(lat, lon, airport.lat, airport.lon);
    airport.reports.sort((a, b) => b.at - a.at);
    const latest = airport.reports[0];
    if (km > radiusKm || now - latest.at > maxAgeMs) continue;
    candidates.push({airport, km, latest, previous:airport.reports[1] || null});
  }
  candidates.sort((a, b) => a.km - b.km);
  const best = candidates[0];
  if (!best) return null;
  const temp = finite(best.latest.item.temp, -40, 60), dew = finite(best.latest.item.dewp, -60, 40);
  const wind = finite(best.latest.item.wspd, 0, 200), gust = finite(best.latest.item.wgst, 0, 250);
  return {
    icao:best.airport.icao,
    distanceKm:Math.round(best.km * 10) / 10,
    time:new Date(best.latest.at).toISOString(),
    temperatureC:temp,
    humidity:humidity(temp, dew),
    windKmh:wind === null ? null : Math.round(wind * 1.852),
    gustKmh:gust === null ? null : Math.round(gust * 1.852),
    weather:parseWeather(best.latest.item.wxString),
    visibility:parseVisibility(best.latest.item.rawOb),
    previous:best.previous ? {time:new Date(best.previous.at).toISOString(), weather:parseWeather(best.previous.item.wxString)} : null
  };
}
