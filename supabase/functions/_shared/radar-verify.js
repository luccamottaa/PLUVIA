// Placar do radar (pedido do dono, 13/11/2026): antes de pensar em trocar a fonte do radar (RainViewer → REDEMET),
// medir quanto cada uma acerta em cima das 27 capitais. Funções puras: quem chama baixa e decodifica as telhas.
// A leitura é a MESMA do app (dist/modules/radar-probe.js): telha de 256 px do zoom 7 (esquema 2, suavizada),
// janela de 9 × 9 pixels em volta do centro do município cortada na borda da telha, eco = alfa acima de 48 e
// "chovendo em cima da cidade" com pelo menos um quarto da janela com eco. A hora é a que TERMINA em hour_end
// (mesmo intervalo da chuva medida pela estação e das contagens de relatos); choveu no radar = algum quadro
// da hora com a cidade molhada.
export const ZOOM = 7;
export const RADIUS = 4;
export const ALPHA = 48;
export const WET_SHARE = 0.25;
export const MIN_FRAMES = 4;
const HOUR_S = 3600;

// Mesmo cálculo de lonLatToPixel do app (telha e pixel dentro dela, arredondados para baixo).
export function cityPixel(lon, lat, z = ZOOM) {
  const n = 256 * 2 ** z, rad = Number(lat) * Math.PI / 180;
  const x = (Number(lon) + 180) / 360 * n;
  const y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n;
  return {tileX:Math.floor(x / 256), tileY:Math.floor(y / 256), px:Math.floor(x % 256), py:Math.floor(y % 256)};
}

// Fração da janela com eco, a partir da telha decodificada em RGBA (256 × 256 × 4). Igual ao app: o canto é
// max(0, px − raio) e a largura min(256 − canto, 2·raio + 1) (perto da borda esquerda/superior a janela desliza,
// perto da direita/inferior ela encolhe).
export function windowShare(rgba, px, py, radius = RADIUS, size = 256) {
  const sx = Math.max(0, px - radius), sy = Math.max(0, py - radius);
  const ex = sx + Math.min(size - sx, radius * 2 + 1), ey = sy + Math.min(size - sy, radius * 2 + 1);
  let wet = 0, total = 0;
  for (let y = sy; y < ey; y += 1) for (let x = sx; x < ex; x += 1) {
    total += 1;
    if (rgba[(y * size + x) * 4 + 3] > ALPHA) wet += 1;
  }
  return total ? wet / total : 0;
}

// Quadros do RainViewer (weather-maps.json, radar.past) dentro da hora que termina em hourEnd (segundos).
export function framesInHour(past, hourEnd) {
  if (!Array.isArray(past)) return [];
  return past.filter(frame => Number.isInteger(frame?.time) && typeof frame?.path === 'string' && /^\/v2\/radar\/[\w/-]+$/.test(frame.path)
    && frame.time > hourEnd - HOUR_S && frame.time <= hourEnd);
}

// Resumo da hora para uma cidade: quadros lidos, quadros com a cidade molhada e a maior fração vista.
// Com menos de MIN_FRAMES quadros a hora não é guardada (lacuna não vira seco nem chuva).
export function radarHour(cityId, source, hourEnd, shares) {
  const valid = shares.filter(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1);
  if (!/^[0-9]{7}$/.test(String(cityId)) || valid.length < MIN_FRAMES) return null;
  return {
    city_id:String(cityId), source, hour_end:new Date(hourEnd * 1000).toISOString(),
    frames:valid.length, wet_frames:valid.filter(value => value >= WET_SHARE).length,
    max_share:Math.round(Math.max(...valid) * 1000) / 1000,
  };
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Aeroporto mais próximo (até 35 km, como em station-now) com boletins METAR/SPECI na hora: choveu se algum
// boletim da hora traz chuva ou garoa NO aeroporto (VC, nas proximidades, não conta; trovoada sem chuva também
// não). parseWeather vem de _shared/metar.js.
export function airportHour(list, cityId, lat, lon, hourEnd, parseWeather, radiusKm = 35) {
  if (!Array.isArray(list) || !/^[0-9]{7}$/.test(String(cityId))) return null;
  const airports = new Map();
  for (const item of list) {
    const icao = String(item?.icaoId || ''), at = Number(item?.obsTime), aLat = Number(item?.lat), aLon = Number(item?.lon);
    if (!/^[A-Z][A-Z0-9]{3}$/.test(icao) || !Number.isInteger(at) || !Number.isFinite(aLat) || !Number.isFinite(aLon)) continue;
    if (at <= hourEnd - HOUR_S || at > hourEnd) continue;
    const entry = airports.get(icao) || {icao, km:distanceKm(lat, lon, aLat, aLon), reports:[]};
    entry.reports.push(parseWeather(item.wxString));
    airports.set(icao, entry);
  }
  const best = [...airports.values()].filter(entry => entry.km <= radiusKm).sort((a, b) => a.km - b.km)[0];
  if (!best) return null;
  return {
    city_id:String(cityId), hour_end:new Date(hourEnd * 1000).toISOString(), icao:best.icao,
    reports:best.reports.length, rained:best.reports.some(weather => Boolean(weather.rain) || weather.drizzle),
  };
}

// Hora fechada mais recente (segundos): a rodada das :12 olha a hora que terminou às :00.
export const lastHourEnd = (nowMs) => Math.floor(nowMs / 1000 / HOUR_S) * HOUR_S;
