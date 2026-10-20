import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, pushSecrets } from "../_shared/supabase.ts";
import { json, preflight, readJson } from "../_shared/http.ts";
import { pushErrorCode, sendWebPush } from "../_shared/webpush.ts";
import { selectCandidates, isRepeat, isOfficialRepeat, stopAllowed, pushUrgency, activeSubscriptions } from "../_shared/notification-policy.js";
import { report } from "../_shared/error-report.js";
import { metarUrl, nearestAirport } from "../_shared/metar.js";
import { stationUrl, normalizeStation } from "../_shared/inmet-station.js";
import { estimate as estimateArrival, windowTiles, windowMask, FRAME_GAP_S, SIZE as NOWCAST_SIZE } from "../_shared/radar-nowcast.js";
import { PNG } from "npm:pngjs@7.0.0";
import { Buffer } from "node:buffer";

type Location = { id: string; user_id: string; city_id: string; city_name: string; uf: string; latitude: number; longitude: number; timezone: string };
type Preference = Record<string, any> & { user_id: string };
type EventCandidate = { type: string; severity: number; title: string; body: string; source: string; start: Date; expires: Date; url: string; fingerprintSeed: string; metadata?: Record<string, unknown> };

const INMET_URL = "https://apiprevmet3.inmet.gov.br/avisos/ativos";
const preferenceFor: Record<string, string> = {
  official_alert: "official_alerts", rain_approaching: "rain_approaching", heavy_rain: "heavy_rain", storm: "storms",
  lightning: "lightning", strong_wind: "strong_wind", extreme_heat: "extreme_heat", air_quality: "air_quality",
  weather_change: "weather_changes", daily_summary: "daily_summary", evening_summary: "evening_summary",
  // Observados (estação do INMET e boletim do aeroporto): ligam junto com os avisos de chuva e tempestade.
  rain_now: "rain_approaching", rain_nearby: "rain_approaching", rain_stopped: "rain_approaching", rain_incoming: "rain_approaching", storm_now: "storms",
};
const asArray = (value: any) => Array.isArray(value) ? value : [];
const text = (value: unknown, max = 500) => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const first = (row: any, keys: string[], fallback: any = "") => keys.map(key => row?.[key]).find(value => value !== undefined && value !== null && value !== "") ?? fallback;
const normalize = (value: unknown) => text(value, 5000).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchJson(url: string, timeout = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "PLUVIA weather alerts/1.0" } });
    if (!response.ok) throw new Error(`source_http_${response.status}`);
    try { return await response.json(); } catch { throw new Error("source_invalid_response"); }
  } catch (error) {
    if (controller.signal.aborted) throw new Error("source_timeout");
    if (error instanceof Error && /^source_(http_\d+|invalid_response)$/.test(error.message)) throw error;
    throw new Error("source_network");
  } finally { clearTimeout(timer); }
}

async function fetchBytes(url: string, timeout = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "PLUVIA weather alerts/1.0" } });
    if (!response.ok) throw new Error(`source_http_${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if (controller.signal.aborted) throw new Error("source_timeout");
    if (error instanceof Error && /^source_http_\d+$/.test(error.message)) throw error;
    throw new Error("source_network");
  } finally { clearTimeout(timer); }
}

// "Chuva chegando" pelo radar (o mesmo cálculo do app, _shared/radar-nowcast.js): imagem do RainViewer de
// 20 min atrás contra a mais recente, deslocamento das manchas e chegada em até 60 min. O aviso só sai
// com 10 a 60 min de antecedência, contados da imagem; movimento sem clareza não vira aviso.
function nowcastCandidate(result: { minutes: number; speedKmh: number } | null, frameAt: number, location: Location, now = new Date()) {
  if (!result || !Number.isFinite(frameAt)) return null;
  const age = (now.getTime() - frameAt) / 60_000;
  const left = result.minutes - age;
  if (age > 20 || left < 10 || left > 60) return null;
  const minutes = Math.round(left / 5) * 5;
  return {
    type: "rain_incoming", severity: 2, title: "🌧️ Chuva chegando",
    body: `O radar mostra chuva vindo na direção de ${location.city_name}: deve chegar em cerca de ${minutes} min, pelo movimento das últimas imagens.`,
    source: "Radar · RainViewer", start: now, expires: new Date(frameAt + (result.minutes + 30) * 60_000), url: "./#chuva",
    fingerprintSeed: `rain_incoming|${location.city_id}|${frameAt}`,
    metadata: { arrival_min: minutes, speed_kmh: result.speedKmh, frame_at: new Date(frameAt).toISOString(), confidence: "moderate" },
  } satisfies EventCandidate;
}
// Só vale olhar o radar quando o modelo já vê chance de chuva nas próximas 3 h (poupa a cota do RainViewer).
function rainLikelySoon(data: any, now = new Date()) {
  const t = now.getTime() / 1000, times = asArray(data?.hourly?.time);
  return times.some((time: unknown, index: number) => {
    const unix = observed(time, 1);
    return unix !== null && unix > t && unix <= t + 3 * 3600 && ((observed(data.hourly.precipitation_probability?.[index], 0, 100) ?? 0) >= 30 || (observed(data.hourly.precipitation?.[index], 0, 500) ?? 0) >= 0.5);
  });
}

function localMinutes(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const hour = Number(parts.find(part => part.type === "hour")?.value || 0), minute = Number(parts.find(part => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function inQuietHours(preference: Preference, severity: number, date = new Date()) {
  if (severity >= 4 || !preference.quiet_start || !preference.quiet_end) return false;
  const parse = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
  const now = localMinutes(preference.timezone || "America/Manaus", date), start = parse(preference.quiet_start), end = parse(preference.quiet_end);
  return start === end ? false : start < end ? now >= start && now < end : now >= start || now < end;
}

function weatherUrl(location: Location) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    // past_hours: a mesma hora de ontem é a referência da mudança de temperatura (sem o ciclo do dia).
    // forecast_days 3: o resumo da noite precisa das 24 horas de amanhã, inclusive a que termina à meia-noite.
    latitude: String(location.latitude), longitude: String(location.longitude), timezone: location.timezone, timeformat: "unixtime", forecast_days: "3", past_hours: "24",
    current: "temperature_2m,apparent_temperature,precipitation,weather_code,wind_gusts_10m",
    hourly: "temperature_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum",
  }).toString();
  return url.toString();
}

function airQualityUrl(location: Location) {
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.search = new URLSearchParams({
    latitude: String(location.latitude), longitude: String(location.longitude), timezone: location.timezone, forecast_days: "1",
    current: "us_aqi,pm2_5,pm10",
  }).toString();
  return url.toString();
}

// Outros modelos, consultados só quando um aviso de chuva vai sair (não a cada rodada). best_match entra na
// consulta para a comparação nunca incluir o próprio modelo do aviso (quando a chuva vem do vencedor da
// cidade, o best_match vira um dos "outros").
const AGREEMENT_MODELS = ["ecmwf_ifs025", "gfs_seamless", "icon_seamless", "best_match"];
function agreementUrl(location: Location) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(location.latitude), longitude: String(location.longitude), timezone: location.timezone, timeformat: "unixtime",
    forecast_days: "2", hourly: "precipitation", models: AGREEMENT_MODELS.join(","),
  }).toString();
  return url.toString();
}

// Quantos outros modelos também preveem chuva nas mesmas horas do aviso (intervalos que terminam de
// window[0] a window[1]). Modelo com alguma hora ausente fica fora da conta; com menos de 2 modelos
// válidos não há concordância a dizer (null). A confiança vem só disso: todos concordam = alta,
// nenhum = baixa, o resto = moderada. Não é probabilidade calibrada; o placar de acerto é que vai dizer
// quanto ela vale.
function modelAgreement(data: any, window: unknown, minMm = 0.5, used = "best_match") {
  if (!Array.isArray(window)) return null;
  const [from, to] = window.map(value => observed(value, 1));
  if (from === null || to === null || to < from) return null;
  const times = asArray(data?.hourly?.time);
  const indexes = times.flatMap((time: unknown, index: number) => {
    const unix = observed(time, 1);
    return unix !== null && unix >= from && unix <= to ? [index] : [];
  });
  if (indexes.length !== (to - from) / 3600 + 1) return null;
  let agree = 0, total = 0;
  for (const model of AGREEMENT_MODELS) {
    if (model === used) continue;
    const values = indexes.map((index: number) => observed(data.hourly[`precipitation_${model}`]?.[index], 0, 500));
    if (values.some((value: number | null) => value === null)) continue;
    total++;
    if (values.some((value: number | null) => (value as number) >= minMm)) agree++;
  }
  return total >= 2 ? { agree, total } : null;
}

function withAgreement(candidate: EventCandidate, data: any, used = "best_match"): EventCandidate {
  if (!["rain_approaching", "heavy_rain"].includes(candidate.type)) return candidate;
  const result = modelAgreement(data, candidate.metadata?.window, candidate.type === "heavy_rain" ? 2.5 : 0.5, used);
  if (!result) return candidate;
  const what = candidate.type === "heavy_rain" ? "chuva forte" : "chuva";
  const note = result.agree === 0
    ? ` Os outros modelos não preveem ${what} nesse horário: pode não acontecer.`
    : result.agree === result.total
    ? ` Os outros ${result.total} modelos também preveem ${what} nesse horário.`
    : ` ${result.agree} de ${result.total} outros modelos também preveem ${what} nesse horário.`;
  const confidence = result.agree === result.total ? "high" : result.agree === 0 ? "low" : "moderate";
  return { ...candidate, body: candidate.body + note, metadata: { ...candidate.metadata, agreement: result, confidence } };
}

// Modelo de chuva vencedor da cidade (pluvia_rain_model, placar de acerto): só volume e chance por hora vêm
// dele, os dois da mesma amostra; temperatura, códigos e o resto continuam no best_match. Se as horas não
// baterem uma a uma, ou se faltar chance ou volume em alguma, nada é trocado.
function rainModelUrl(location: Location, model: string) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(location.latitude), longitude: String(location.longitude), timezone: location.timezone, timeformat: "unixtime",
    forecast_days: "3", past_hours: "24", hourly: "precipitation,precipitation_probability", models: model,
  }).toString();
  return url.toString();
}
function withRainModel(weather: any, other: any) {
  const times = asArray(weather?.hourly?.time), theirs = asArray(other?.hourly?.time);
  if (!times.length || times.length !== theirs.length || times.some((time: unknown, index: number) => time !== theirs[index])) return null;
  const mm = asArray(other.hourly.precipitation), chance = asArray(other.hourly.precipitation_probability);
  const valid = (list: unknown[], max: number) => list.length === times.length && list.every(value => observed(value, 0, max) !== null);
  if (!valid(mm, 500) || !valid(chance, 100)) return null;
  return { ...weather, hourly: { ...weather.hourly, precipitation: mm, precipitation_probability: chance } };
}

// Null, strings and booleans are missing observations, never numeric zero.
function observed(value: unknown, min = -Infinity, max = Infinity): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}
function freshCurrent(data: any, now: Date) {
  const at = observed(data?.current?.time, 1);
  return at !== null && now.getTime() / 1000 - at >= -900 && now.getTime() / 1000 - at <= 5400;
}
function weatherCode(value: unknown) {
  return [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99].includes(value as number) ? value as number : null;
}
function detectAirQuality(data: any, location: Location, now = new Date()) {
  if (!freshCurrent(data, now)) return null;
  const reading = observed(data?.current?.us_aqi, 0, 1000);
  if (reading === null || reading < 101) return null;
  const aqi = Math.round(reading);
  const severity = aqi >= 201 ? 4 : aqi >= 151 ? 3 : 2;
  const guidance = severity >= 3 ? "Reduza esforço prolongado ao ar livre, especialmente se você faz parte de um grupo sensível." : "Pessoas sensíveis podem preferir reduzir esforço prolongado ao ar livre.";
  return {
    type: "air_quality", severity, title: "🌫️ Qualidade do ar em atenção",
    body: `O índice de qualidade do ar está em ${aqi} na região de ${location.city_name}. ${guidance}`,
    source: "Open-Meteo · modelo CAMS", start: now, expires: new Date(now.getTime() + 6 * 3_600_000), url: "./#qualidade-do-ar",
    fingerprintSeed: `air_quality|${location.city_id}|${Math.floor(now.getTime() / 21_600_000)}|${severity}`,
    metadata: { us_aqi: aqi, pm2_5: observed(data?.current?.pm2_5, 0), pm10: observed(data?.current?.pm10, 0), confidence: "moderate" },
  } satisfies EventCandidate;
}

// Mesmos limites de intensidade do "Vai chover?" do app (mm/h).
function rainIntensity(mm: number) {
  return mm >= 7.5 ? "Chuva forte" : mm >= 2.5 ? "Chuva moderada" : "Chuva fraca";
}

// Diferença média entre as próximas horas e as mesmas horas de ontem. Comparar com a temperatura de agora
// avisava o ciclo normal do dia (de madrugada "pode subir 8 °C", à tarde "pode cair 7 °C"): em outubro/2026
// era a notificação mais enviada. Pede pelo menos 4 pares válidos; ausência nunca vira zero.
function temperatureChange(times: number[], temperatures: unknown[], upcoming: number[]) {
  const byTime = new Map<number, number>();
  times.forEach((time, index) => {
    const value = observed(temperatures?.[index], -100, 65);
    if (value !== null) byTime.set(time, value);
  });
  const deltas = upcoming.flatMap(time => {
    const today = byTime.get(time), yesterday = byTime.get(time - 86_400);
    return today === undefined || yesterday === undefined ? [] : [today - yesterday];
  });
  return deltas.length >= 4 ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length : null;
}

function detectWeather(data: any, location: Location, now = new Date()) {
  const events: EventCandidate[] = [];
  if (!freshCurrent(data, now)) return events;
  const currentTime = now.getTime() / 1000;
  const times = asArray(data?.hourly?.time);
  // An unordered/duplicate series cannot establish real forecast intervals.
  const ordered = times.every((time: unknown, index: number) => observed(time, 1) !== null && (!index || (time as number) > times[index - 1]));
  const upcoming = (ordered ? times : []).map((time: number, index: number) => ({
    time, probability: observed(data.hourly.precipitation_probability?.[index], 0, 100), precipitation: observed(data.hourly.precipitation?.[index], 0, 500),
    code: weatherCode(data.hourly.weather_code?.[index]), gust: observed(data.hourly.wind_gusts_10m?.[index], 0, 500),
    temperature: observed(data.hourly.temperature_2m?.[index], -100, 65),
    // Accumulations describe the preceding hour; gaps are not longer intervals.
    rainInterval: index > 0 && time - times[index - 1] === 3600,
  })).filter((row: any) => row.time > currentTime && row.time <= currentTime + 6 * 3600);
  const next3h = upcoming.filter((row: any) => row.time <= currentTime + 3 * 3600);
  const futureRain = next3h.filter((row: any) => row.rainInterval && row.precipitation !== null && row.probability !== null);
  // Probability and amount must describe the SAME interval.
  const intenseRain = futureRain.filter((row: any) => row.precipitation >= 5 && row.probability >= 70);
  const rainHours = futureRain.filter((row: any) => row.precipitation >= .5 && row.probability >= 60);
  const peakRain = Math.max(0, ...rainHours.map((row: any) => row.precipitation));
  const peakProbability = Math.max(0, ...rainHours.map((row: any) => row.probability));
  const peakGust = Math.max(0, observed(data?.current?.wind_gusts_10m, 0, 500) ?? 0, ...next3h.map((row: any) => row.gust ?? 0));
  const futurePeakGust = Math.max(0, ...upcoming.map((row: any) => row.gust ?? 0));
  const stormCode = Math.max(0, weatherCode(data?.current?.weather_code) ?? 0, ...next3h.map((row: any) => row.code ?? 0));
  const currentRain = observed(data?.current?.precipitation, 0, 500);
  const apparent = observed(data?.current?.apparent_temperature, -100, 80), temperature = observed(data?.current?.temperature_2m, -100, 65);
  const bucket = Math.floor(now.getTime() / 21_600_000);
  const end2h = new Date(now.getTime() + 2 * 3_600_000), end3h = new Date(now.getTime() + 3 * 3_600_000);
  const localHour = (unix: number) => new Intl.DateTimeFormat('pt-BR',{timeZone:location.timezone,hour:'2-digit',minute:'2-digit'}).format(new Date(unix*1000));
  // Intervalo do Open-Meteo termina no horário: a hora com chuva vai de time-1h até time.
  const windowOf = (rows: any[]) => rows.length ? `entre ${localHour(rows[0].time - 3600)} e ${localHour(rows.at(-1).time)}` : "nas próximas horas";

  if (currentRain !== null && currentRain < 0.2 && rainHours.length > 0) events.push({
    type: "rain_approaching", severity: 2, title: "🌧️ Chuva nas próximas horas",
    body: `${rainIntensity(peakRain)} ${windowOf(rainHours)} em ${location.city_name}, com até ${Math.round(peakProbability)}% de chance. Vale levar guarda-chuva.`, source: "Open-Meteo · modelo",
    start: now, expires: end2h, url: "./#chuva", fingerprintSeed: `rain_approaching|${location.city_id}|${bucket}|2`, metadata: { peak_probability: peakProbability, peak_mm_h: peakRain, window: [rainHours[0]?.time, rainHours.at(-1)?.time], confidence: "moderate" },
  });
  if (intenseRain.length) {
    const intensity = Math.max(...intenseRain.map((row: any) => row.precipitation));
    const severity = intensity >= 15 ? 4 : 3;
    events.push({ type: "heavy_rain", severity, title: "🌧️ Chuva forte prevista", body: `Chuva forte ${windowOf(intenseRain)} em ${location.city_name}, até ${Math.round(intensity)} mm em uma hora. Evite áreas alagáveis e acompanhe os avisos oficiais.`, source: "Open-Meteo · modelo", start: now, expires: end3h, url: "./#chuva", fingerprintSeed: `heavy_rain|${location.city_id}|${bucket}|${severity}`, metadata: { peak_probability: Math.max(...intenseRain.map((row: any) => row.probability)), peak_mm_h: intensity, window: [intenseRain[0].time, intenseRain[intenseRain.length - 1].time], confidence: "moderate" } });
  }
  if (stormCode >= 95) {
    const severity = stormCode >= 99 ? 4 : 3;
    // Código de trovoada do modelo descreve a hora que termina no horário; "agora" só pela leitura atual.
    const firstStorm = (weatherCode(data?.current?.weather_code) ?? 0) >= 95 ? null : next3h.find((row: any) => (row.code ?? 0) >= 95);
    const when = !firstStorm ? "agora" : firstStorm.time - 3600 <= currentTime ? "na próxima hora" : `a partir das ${localHour(firstStorm.time - 3600)}`;
    events.push({ type: "storm", severity, title: "⛈️ Tempestade possível", body: `Sinal de trovoada ${when} em ${location.city_name}. Raios, chuva intensa e rajadas podem ocorrer.`, source: "Open-Meteo · modelo", start: now, expires: end3h, url: "./#alertas", fingerprintSeed: `storm|${location.city_id}|${bucket}|${severity}`, metadata: { weather_code: stormCode, confidence: "moderate" } });
  }
  if (peakGust >= 60) {
    const severity = peakGust >= 90 ? 4 : 3;
    events.push({ type: "strong_wind", severity, title: "💨 Rajadas fortes possíveis", body: `Rajadas de até cerca de ${Math.round(peakGust)} km/h aparecem na previsão para ${location.city_name}. Proteja objetos soltos e acompanhe avisos oficiais.`, source: "Open-Meteo · modelo", start: now, expires: end3h, url: "./#agora", fingerprintSeed: `strong_wind|${location.city_id}|${bucket}|${severity}`, metadata: { peak_gust_kmh: peakGust, confidence: "moderate" } });
  }
  if ((apparent !== null && apparent >= 42) || (temperature !== null && temperature >= 40)) {
    const severity = (apparent !== null && apparent >= 48) || (temperature !== null && temperature >= 43) ? 4 : 3;
    const heat = apparent !== null ? `A sensação térmica está em torno de ${Math.round(apparent)} °C` : `A temperatura está em torno de ${Math.round(temperature!)} °C`;
    events.push({ type: "extreme_heat", severity, title: "🌡️ Calor intenso", body: `${heat} em ${location.city_name}. Hidrate-se e reduza esforço sob o sol.`, source: "Open-Meteo · modelo", start: now, expires: end3h, url: "./#agora", fingerprintSeed: `extreme_heat|${location.city_id}|${bucket}|${severity}`, metadata: { temperature_c: temperature, apparent_c: apparent, confidence: "moderate" } });
  }
  const temperatureDelta = (ordered ? temperatureChange(times, data.hourly.temperature_2m, upcoming.map((row: any) => row.time)) : null) ?? 0;
  const currentCode = weatherCode(data?.current?.weather_code);
  const dryNow = currentRain !== null && currentRain < 0.2 && currentCode !== null && currentCode < 51;
  const lateRain = dryNow ? upcoming.find((row: any) => row.time > currentTime + 3 * 3600 && row.rainInterval && row.precipitation !== null && row.probability !== null && row.precipitation >= 1 && row.probability >= 60) : undefined;
  const rainTransition = Boolean(lateRain);
  const currentGust = observed(data?.current?.wind_gusts_10m, 0, 500);
  const windTransition = currentGust !== null && currentGust < 35 && futurePeakGust >= 55;
  const windyHour = windTransition ? upcoming.find((row: any) => (row.gust ?? 0) >= 55) : undefined;
  const temperatureShift = Math.abs(temperatureDelta) >= 6;
  if (temperatureShift || rainTransition || windTransition) {
    const reasons = [
      temperatureShift ? `cerca de ${Math.round(Math.abs(temperatureDelta))} °C ${temperatureDelta < 0 ? "a menos" : "a mais"} que ontem no mesmo horário` : "",
      lateRain ? `chuva a partir das ${localHour(lateRain.time - 3600)}` : "",
      windTransition ? `rajadas de até ${Math.round(futurePeakGust)} km/h${windyHour ? ` a partir das ${localHour(windyHour.time - 3600)}` : ""}` : "",
    ].filter(Boolean);
    const kinds = [temperatureShift ? (temperatureDelta < 0 ? "colder" : "warmer") : "", rainTransition ? "rain" : "", windTransition ? "wind" : ""].filter(Boolean);
    // Só temperatura: no máximo um aviso por dia municipal e sentido (a massa de ar não muda de 6 em 6 horas).
    const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: location.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    events.push({
      type: "weather_change", severity: windTransition || Math.abs(temperatureDelta) >= 9 ? 3 : 2,
      title: temperatureShift && kinds.length === 1 ? (temperatureDelta < 0 ? "🌡️ Mais frio que ontem" : "🌡️ Mais quente que ontem") : "🌦️ Mudança relevante no tempo",
      body: `Nas próximas horas em ${location.city_name}: ${reasons.join(" e ")}.`,
      source: "Open-Meteo · modelo", start: now, expires: new Date(now.getTime() + 6 * 3_600_000), url: "./#previsao",
      fingerprintSeed: `weather_change|${location.city_id}|${kinds.length === 1 && temperatureShift ? localDay : bucket}|${kinds.join("|")}`,
      metadata: { temperature_delta_c: Math.round(temperatureDelta * 10) / 10, rain_transition: rainTransition, wind_transition: windTransition, confidence: "moderate" },
    });
  }
  return events;
}

function normalizeInmet(raw: any) {
  const rows = Array.isArray(raw) ? raw : raw && (Array.isArray(raw.hoje) || Array.isArray(raw.futuro)) ? [...asArray(raw.hoje), ...asArray(raw.futuro)] : asArray(raw?.avisos || raw?.alerts || raw?.data || raw?.features);
  return rows.map((row: any) => row?.properties || row).filter(Boolean);
}

// Chuva e trovoada observadas (pedido do usuário, outubro/2026): o modelo erra o horário das pancadas,
// então o aviso também sai quando a estação do INMET mede chuva que acabou de começar, quando o
// aeroporto mais próximo relata trovoada ou chuva (METAR/SPECI) ou quando relata chuva ou trovoada
// nas proximidades. Só observação recente; ausência de leitura nunca vira "sem chuva".
function detectObserved({ station, airport }: { station: any; airport: any }, location: Location, now = new Date()) {
  const events: EventCandidate[] = [];
  const at = (iso: unknown) => typeof iso === "string" ? Date.parse(iso) : NaN;
  const fresh = (value: number, max: number) => Number.isFinite(value) && now.getTime() - value <= max && value - now.getTime() <= 15 * 60_000;
  const hour = (value: number) => new Intl.DateTimeFormat("pt-BR", { timeZone: location.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  // Cada boletim/leitura vira um evento próprio (o horário entra na chave). Com uma janela fixa de 3 h, um
  // boletim novo reaproveitava o evento já criado, com o texto e o horário do boletim anterior, e quem
  // ainda não tinha recebido ganhava um "começou a chover às 00:00" à 01:27. A repetição no mesmo episódio
  // continua barrada por isRepeat (grupo observed/nearby, 6 h).
  const expires = new Date(now.getTime() + 2 * 3_600_000);
  const airportAt = at(airport?.time), wx = airport?.weather && fresh(airportAt, 75 * 60_000) ? airport.weather : null;
  const near = wx && typeof airport.distanceKm === "number" ? `, a ${Math.round(airport.distanceKm)} km` : "";
  const place = wx ? `O aeroporto mais próximo (${text(airport.icao, 4)}${near})` : "";
  const previous = airport?.previous?.weather || null;
  const rainName = (weather: any) => weather?.drizzle && !weather?.rain ? "garoa" : `${weather?.showers ? "pancadas de chuva" : "chuva"}${({ light: " fraca", heavy: " forte" } as Record<string, string>)[weather?.rain] || ""}`;
  if (wx?.thunder === true) events.push({
    type: "storm_now", severity: 3, title: "⛈️ Trovoada agora",
    body: `${place} relatou trovoada${wx.rain ? " com chuva" : ""} perto de ${location.city_name} às ${hour(airportAt)}. Procure abrigo e evite áreas abertas.`,
    source: "Aeroporto · boletim METAR", start: now, expires, url: "./#agora", fingerprintSeed: `storm_now|${location.city_id}|${airportAt}`,
    metadata: { icao: airport.icao, observed_at: new Date(airportAt).toISOString(), confidence: "high" },
  });
  const stationAt = at(station?.time), mm = typeof station?.rainMm === "number" ? station.rainMm : null;
  const before = typeof station?.previousRainMm === "number" ? station.previousRainMm : null;
  // Começou: ≥ 1 mm na hora que acabou de fechar, com a hora anterior seca ou sem leitura de 1 h.
  if (station?.station && fresh(stationAt, 45 * 60_000) && mm !== null && mm >= 1 && !(before !== null && before >= 0.2)) {
    const distance = typeof station.station.distanceKm === "number" && station.station.distanceKm >= 5 ? `, a ${Math.round(station.station.distanceKm)} km` : "";
    events.push({
      type: "rain_now", severity: 2, title: "🌧️ Começou a chover",
      body: `A estação do INMET mais próxima de ${location.city_name}${distance} mediu ${mm.toFixed(1).replace(".", ",")} mm entre ${hour(stationAt - 3_600_000)} e ${hour(stationAt)}.`,
      source: "INMET · estação automática", start: now, expires, url: "./#agora", fingerprintSeed: `rain_now|${location.city_id}|station|${stationAt}`,
      metadata: { rain_mm: mm, observed_at: new Date(stationAt).toISOString(), confidence: "high" },
    });
  } else if (wx && !wx.thunder && (wx.rain || wx.drizzle) && previous && !previous.rain && !previous.drizzle && !previous.thunder) {
    events.push({
      type: "rain_now", severity: 2, title: "🌧️ Começou a chover",
      body: `${place} relatou ${rainName(wx)} perto de ${location.city_name} às ${hour(airportAt)}.`,
      source: "Aeroporto · boletim METAR", start: now, expires, url: "./#agora", fingerprintSeed: `rain_now|${location.city_id}|airport|${airportAt}`,
      metadata: { icao: airport.icao, observed_at: new Date(airportAt).toISOString(), confidence: "high" },
    });
  }
  // Parou: a hora que acabou de fechar ficou seca na estação depois de uma hora com ≥ 1 mm, ou o aeroporto
  // deixou de relatar chuva/trovoada. Nunca com a outra fonte ainda medindo chuva. Pode ser só uma pausa, e o
  // texto diz isso. deliver() só manda para quem recebeu "começou a chover"/"trovoada agora" da cidade.
  const stationWet = mm !== null && mm >= 0.2 && fresh(stationAt, 45 * 60_000);
  const airportWet = Boolean(wx && (wx.rain || wx.drizzle || wx.thunder));
  const stationStopped = station?.station && fresh(stationAt, 45 * 60_000) && mm !== null && mm < 0.2 && before !== null && before >= 1;
  const airportStopped = wx && !airportWet && !wx.nearbyThunder && previous && (previous.rain || previous.drizzle || previous.thunder);
  if (stationStopped && !airportWet) {
    const distance = typeof station.station.distanceKm === "number" && station.station.distanceKm >= 5 ? `, a ${Math.round(station.station.distanceKm)} km` : "";
    events.push({
      type: "rain_stopped", severity: 1, title: "🌤️ Parou de chover",
      body: `A estação do INMET mais próxima de ${location.city_name}${distance} não registrou chuva entre ${hour(stationAt - 3_600_000)} e ${hour(stationAt)}, depois de ${before!.toFixed(1).replace(".", ",")} mm na hora anterior. Pode ser só uma pausa.`,
      source: "INMET · estação automática", start: now, expires, url: "./#chuva", fingerprintSeed: `rain_stopped|${location.city_id}|station|${stationAt}`,
      metadata: { previous_rain_mm: before, observed_at: new Date(stationAt).toISOString(), confidence: "high" },
    });
  } else if (airportStopped && !stationWet) events.push({
    type: "rain_stopped", severity: 1, title: "🌤️ Parou de chover",
    body: `${place} deixou de relatar chuva às ${hour(airportAt)}, perto de ${location.city_name}. Pode ser só uma pausa.`,
    source: "Aeroporto · boletim METAR", start: now, expires, url: "./#chuva", fingerprintSeed: `rain_stopped|${location.city_id}|airport|${airportAt}`,
    metadata: { icao: airport.icao, observed_at: new Date(airportAt).toISOString(), confidence: "high" },
  });
  // Por perto: chuva ou trovoada nas proximidades do aeroporto, sem nada no próprio aeroporto nem na estação.
  if (wx && !wx.thunder && !wx.rain && !wx.drizzle && (wx.nearbyThunder || wx.nearbyShowers) && !(mm !== null && mm >= 0.2 && fresh(stationAt, 45 * 60_000))) events.push({
    type: "rain_nearby", severity: 2, title: wx.nearbyThunder ? "🌦️ Trovoada por perto" : "🌦️ Chuva por perto",
    body: `${place} relatou ${wx.nearbyThunder ? "trovoada" : "pancadas de chuva"} nas proximidades às ${hour(airportAt)}. A chuva pode chegar a ${location.city_name} em breve.`,
    source: "Aeroporto · boletim METAR", start: now, expires, url: "./#chuva", fingerprintSeed: `rain_nearby|${location.city_id}|${airportAt}`,
    metadata: { icao: airport.icao, observed_at: new Date(airportAt).toISOString(), thunder: wx.nearbyThunder === true, confidence: "moderate" },
  });
  return events;
}

// Chuva medida ou relatada agora (mesmas janelas de frescor de detectObserved). Só serve para calar
// "chuva nas próximas horas" enquanto chove; leitura velha ou ausente nunca vira "seco".
function rainingNow({ station, airport }: { station: any; airport: any }, now = new Date()) {
  const fresh = (iso: unknown, max: number) => {
    const at = typeof iso === "string" ? Date.parse(iso) : NaN;
    return Number.isFinite(at) && now.getTime() - at <= max && at - now.getTime() <= 15 * 60_000;
  };
  const stationRain = station?.station && typeof station.rainMm === "number" && station.rainMm >= 0.2 && fresh(station.time, 45 * 60_000);
  const wx = airport?.weather;
  const airportRain = wx && (wx.rain || wx.drizzle || wx.thunder) && fresh(airport.time, 75 * 60_000);
  return Boolean(stationRain || airportRain);
}

function parseInmetDate(alert: any, type: "inicio" | "fim") {
  const date = alert?.[`data_${type}`], time = alert?.[`hora_${type}`];
  if (date && /^\d{2}:\d{2}/.test(String(time || ""))) return new Date(`${String(date).slice(0, 10)}T${String(time).slice(0, 8)}-03:00`);
  const raw = first(alert, type === "inicio" ? ["inicio", "onset", "effective"] : ["fim", "expires", "termino"]);
  if (!raw) return null;
  let value = String(raw).trim().replace(" ", "T");
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) value += "-03:00";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

// "hoje às 22:59", "amanhã às 23:01" ou "qua., 21/10 às 22:59", no calendário da cidade.
function alertWhen(date: Date, now: Date, timeZone: string) {
  const day = (value: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
  const days = Math.round((Date.parse(day(date)) - Date.parse(day(now))) / 86_400_000);
  if (days === 0) return `hoje às ${time}`;
  if (days === 1) return `amanhã às ${time}`;
  return `${new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "short", day: "2-digit", month: "2-digit" }).format(date)} às ${time}`;
}

function inmetForLocation(alerts: any[], location: Location, now = new Date()) {
  return alerts.flatMap((alert: any) => {
    if ([true, 1, "1", "true"].includes(alert.encerrado) || /cancel/i.test(String(alert.msgType || ""))) return [];
    const codes: string[] = JSON.stringify(alert.geocodes || alert.geocode || "").match(/\b\d{7}\b/g) || [];
    const towns = normalize(JSON.stringify(alert.municipios || alert.municipio || "")).split(/[,;|/"\[\]{}:]/)
      .map(value => value.trim().replace(/\s*(?:-\s*[a-z]{2}|\([a-z]{2}\))$/, '').trim());
    const region = normalize(JSON.stringify([alert.estados, alert.uf, alert.sigla, alert.area, alert.areaDesc]));
    const tokens = region.split(/[^a-z0-9]+/).filter(Boolean);
    const normalizedCity = normalize(location.city_name), normalizedUf = normalize(location.uf);
    const cityMatch = codes.length ? codes.includes(location.city_id) : towns.includes(normalizedCity) && tokens.includes(normalizedUf);
    if (!cityMatch) return [];
    const end = parseInmetDate(alert, "fim"), start = parseInmetDate(alert, "inicio");
    if (!end || !start || !Number.isFinite(end.getTime()) || !Number.isFinite(start.getTime()) || end <= start || end <= now || start > new Date(now.getTime() + 24 * 3_600_000)) return [];
    const severityText = normalize(first(alert, ["severidade", "severity", "nivel"]));
    const color = normalize(first(alert, ["aviso_cor", "cor"]));
    const severity = severityText.includes("grande perigo") || color.includes("ff0000") ? 4 : severityText === "perigo" || color.includes("f96602") || color.includes("ffa500") ? 3 : 2;
    const severityLabel = severity === 4 ? "Grande perigo" : severity === 3 ? "Perigo" : "Perigo potencial";
    const id = text(first(alert, ["id_aviso", "id", "identifier"], `${location.city_id}-${start.toISOString()}`), 100);
    const phenomenon = text(first(alert, ["descricao", "evento", "titulo", "tipo"], "Aviso meteorológico"), 100);
    const risk = text(first(alert, ["riscos", "description"], "Consulte os riscos e as orientações no aviso oficial."), 260);
    // Aviso que ainda vai começar diz quando começa; "válido até 22:59" sem data parecia valer agora (19/10/2026:
    // o aviso de amanhã às 23:01 chegou às 23:05 da véspera).
    const area = `${location.city_name}, ${location.uf}`;
    const when = start.getTime() > now.getTime() + 5 * 60_000
      ? `${severityLabel} previsto em ${area}, de ${alertWhen(start, now, location.timezone)} até ${alertWhen(end, now, location.timezone)}.`
      : `${severityLabel} em ${area}, válido até ${alertWhen(end, now, location.timezone)}.`;
    return [{ type: "official_alert", severity, title: `⚠️ ${phenomenon}`, body: `${when} ${risk} Fonte: INMET.`, source: "INMET · alerta oficial", start, expires: end, url: "./#alertas", fingerprintSeed: `official_alert|${id}|${location.city_id}|${severity}`, metadata: { official_id: id, area: `${location.city_name}, ${location.uf}`, severity_label: severityLabel, valid_until: end.toISOString(), confidence: "high" } } satisfies EventCandidate];
  });
}

// Quando a chuva é mais provável num dia municipal, para o resumo dizer o horário em vez de só "até 70%".
// Horas do Open-Meteo descrevem o intervalo que termina no horário; só conta o que ainda não passou.
// "Sem chuva prevista" exige todas as horas restantes do dia com chance e volume válidos; senão, null
// e o resumo volta ao texto com a chance máxima do dia.
function rainOutlook(data: any, location: Location, day: string, now: Date) {
  const times = asArray(data?.hourly?.time);
  const dayKey = (unix: number) => new Intl.DateTimeFormat("en-CA", { timeZone: location.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(unix * 1000));
  const hour = (unix: number) => new Intl.DateTimeFormat("pt-BR", { timeZone: location.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(unix * 1000));
  const rows: any[] = times.flatMap((value: unknown, index: number) => {
    const time = observed(value, 1);
    if (time === null || time * 1000 <= now.getTime() || dayKey(time - 3600) !== day) return [];
    return [{ time, probability: observed(data.hourly.precipitation_probability?.[index], 0, 100), precipitation: observed(data.hourly.precipitation?.[index], 0, 500) }];
  });
  if (!rows.length || rows.some((row: any, index: number) => index && row.time - rows[index - 1].time !== 3600)) return null;
  const likely: any[] = rows.filter((row: any) => row.probability !== null && row.probability >= 30);
  if (likely.length) {
    const peak = Math.max(...likely.map((row: any) => row.probability));
    const span = (likely.at(-1).time - likely[0].time) / 3600 + 1;
    const when = span > 9 ? "ao longo do dia" : `entre ${hour(likely[0].time - 3600)} e ${hour(likely.at(-1).time)}`;
    // "Mais provável" só com 50% ou mais; abaixo disso a frase não promete chuva.
    return { text: `${peak >= 50 ? "Chuva mais provável" : "Pode chover"} ${when} (até ${Math.round(peak)}%).`, wet: peak >= 50 };
  }
  // Dia restante precisa terminar na meia-noite local, sem lacunas, para afirmar que não há chuva.
  const complete = dayKey(rows.at(-1).time) !== day && rows.every((row: any) => row.probability !== null && row.precipitation !== null);
  return complete && rows.every((row: any) => row.precipitation < 0.5) ? { text: "Sem chuva prevista.", wet: false } : null;
}

function dailySummaryCandidate(data: any, location: Location, preference: Preference, now = new Date()) {
  if (!preference.daily_summary) return null;
  const target = String(preference.daily_summary_time || "07:00").slice(0, 5);
  const [hour, minute] = target.split(":").map(Number), current = localMinutes(location.timezone, now);
  if (Math.abs(current - (hour * 60 + minute)) > 4) return null;
  if (!freshCurrent(data, now)) return null;
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: location.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const day = asArray(data?.daily?.time).findIndex((at: unknown) => {
    const unix = observed(at, 1);
    return unix !== null && new Intl.DateTimeFormat("en-CA", {timeZone:location.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(unix * 1000)) === localDay;
  });
  if (day < 0) return null;
  const high = observed(data?.daily?.temperature_2m_max?.[day], -100, 65), low = observed(data?.daily?.temperature_2m_min?.[day], -100, 65);
  const chance = observed(data?.daily?.precipitation_probability_max?.[day], 0, 100);
  if (high === null || low === null || chance === null || low > high) return null;
  const max = Math.round(high), min = Math.round(low), rain = Math.round(chance);
  const outlook = rainOutlook(data, location, localDay, now);
  const body = outlook ? `Máxima de ${max} °C e mínima de ${min} °C. ${outlook.text}` : `Máxima de ${max} °C, mínima de ${min} °C e até ${rain}% de chance de chuva.`;
  return { type: "daily_summary", severity: 1, title: `☀️ ${location.city_name} hoje`, body, source: "Open-Meteo · modelo", start: now, expires: new Date(now.getTime() + 6 * 3_600_000), url: "./#previsao", fingerprintSeed: `daily_summary|${location.city_id}|${localDay}`, metadata: { max_c: max, min_c: min, rain_probability: rain, confidence: "moderate" } } satisfies EventCandidate;
}

// Resumo da noite: a previsão de amanhã no calendário da cidade, no horário escolhido (20:00 por padrão).
// Mesmas regras do resumo da manhã: janela de 4 min do cron, leitura atual recente, valores finitos.
// O volume só entra quando veio do modelo; ausente nunca vira "sem chuva".
function eveningSummaryCandidate(data: any, location: Location, preference: Preference, now = new Date()) {
  if (!preference.evening_summary) return null;
  const target = String(preference.evening_summary_time || "20:00").slice(0, 5);
  const [hour, minute] = target.split(":").map(Number), current = localMinutes(location.timezone, now);
  if (Math.abs(current - (hour * 60 + minute)) > 4) return null;
  if (!freshCurrent(data, now)) return null;
  const dayKey = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: location.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const today = dayKey(now);
  // Amanhã municipal: o primeiro dia da previsão depois de hoje no fuso da cidade (horário de verão incluído).
  const day = asArray(data?.daily?.time).findIndex((at: unknown) => {
    const unix = observed(at, 1);
    return unix !== null && dayKey(new Date(unix * 1000)) > today;
  });
  if (day < 0) return null;
  const tomorrow = dayKey(new Date(observed(data.daily.time[day], 1)! * 1000));
  const high = observed(data?.daily?.temperature_2m_max?.[day], -100, 65), low = observed(data?.daily?.temperature_2m_min?.[day], -100, 65);
  const chance = observed(data?.daily?.precipitation_probability_max?.[day], 0, 100);
  if (high === null || low === null || chance === null || low > high) return null;
  const total = observed(data?.daily?.precipitation_sum?.[day], 0, 2000);
  const max = Math.round(high), min = Math.round(low), rain = Math.round(chance);
  const volume = total !== null && total >= 1 ? ` (${Math.round(total)} mm)` : "";
  const wet = rain >= 50 && (total === null || total >= 1);
  const outlook = rainOutlook(data, location, tomorrow, now);
  const body = outlook
    ? `${wet ? "Leve guarda-chuva. " : ""}Máxima de ${max} °C e mínima de ${min} °C. ${outlook.text}${outlook.wet && total !== null && total >= 1 ? ` Total previsto: ${Math.round(total)} mm.` : ""}`
    : wet
    ? `Leve guarda-chuva: até ${rain}% de chance de chuva${volume}. Máxima de ${max} °C e mínima de ${min} °C.`
    : `Máxima de ${max} °C, mínima de ${min} °C e até ${rain}% de chance de chuva${volume}.`;
  return { type: "evening_summary", severity: 1, title: `🌙 ${location.city_name} amanhã`, body, source: "Open-Meteo · modelo", start: now, expires: new Date(now.getTime() + 12 * 3_600_000), url: "./#previsao", fingerprintSeed: `evening_summary|${location.city_id}|${tomorrow}`, metadata: { day: tomorrow, max_c: max, min_c: min, rain_probability: rain, rain_mm: total === null ? null : Math.round(total * 10) / 10, confidence: "moderate" } } satisfies EventCandidate;
}

async function createEvent(admin: any, location: Location, candidate: EventCandidate) {
  const fingerprint = await sha256(candidate.fingerprintSeed);
  const { data, error } = await admin.from("notification_events").insert({
    event_type: candidate.type, city_id: location.city_id, city_name: location.city_name, uf: location.uf,
    latitude: Math.round(location.latitude * 1000) / 1000, longitude: Math.round(location.longitude * 1000) / 1000,
    severity: candidate.severity, fingerprint, started_at: candidate.start.toISOString(), expires_at: candidate.expires.toISOString(),
    source: candidate.source, title: candidate.title, body: candidate.body, target_url: candidate.url, metadata: candidate.metadata || {},
  }).select("id").single();
  if (error?.code === "23505") {
    const { data: existing, error: existingError } = await admin.from("notification_events").select("id").eq("fingerprint", fingerprint).single();
    if (existingError || !existing) throw existingError || new Error("event_lookup_failed");
    return { ...candidate, cityId:location.city_id, id: existing.id, fingerprint, created: false };
  }
  if (error) throw error;
  return { ...candidate, cityId:location.city_id, id: data.id, fingerprint, created: true };
}

async function deliver(admin: any, event: any, preference: Preference, subscriptions: any[], userId: string, vapid: any, deadline = Infinity) {
  const flag = preferenceFor[event.type];
  const belowMinimum = !["daily_summary", "evening_summary"].includes(event.type) && event.severity < Number(preference.minimum_severity || 1);
  if (!preference.notifications_enabled || (flag && !preference[flag]) || belowMinimum || inQuietHours(preference, event.severity)) return { accepted: 0, skipped: subscriptions.length };
  let accepted = 0, skipped = 0;
  for (const subscription of subscriptions) {
    if (Date.now() >= deadline) return { accepted, skipped, deferred: true };
    // Fingerprints already deduplicate the same event. This also covers bucket
    // boundaries and related model signals, but lets severity increases through.
    if (!['official_alert','daily_summary','evening_summary'].includes(event.type)) {
      const {data:recent,error:recentError} = await admin.from('notification_deliveries')
        .select('status,sent_at,created_at,notification_events!inner(event_type,severity,city_id,metadata)')
        .eq('subscription_id',subscription.id).eq('notification_events.city_id',event.cityId)
        .in('status',['accepted','pending']).gte('created_at',new Date(Date.now()-6*3600000).toISOString());
      if (recentError) throw new Error("dedup_lookup_failed");
      // "Parou de chover" fecha o ciclo: só depois de um "começou a chover"/"trovoada agora" entregue a este aparelho.
      if (event.type === "rain_stopped" ? !stopAllowed(recent || []) : isRepeat(event,recent || [])) { skipped++; continue; }
    }
    if (event.type === "official_alert") {
      const { data: recent, error: recentError } = await admin.from("notification_deliveries")
        .select("status,notification_events!inner(event_type,severity,city_id,title,metadata)")
        .eq("subscription_id", subscription.id).eq("notification_events.city_id", event.cityId).eq("notification_events.event_type", "official_alert")
        .in("status", ["accepted", "pending"]).gte("created_at", new Date(Date.now() - 72 * 3600000).toISOString());
      if (recentError) throw new Error("dedup_lookup_failed");
      if (isOfficialRepeat(event, Array.isArray(recent) ? recent : [])) { skipped++; continue; }
    }
    const { data: delivery, error } = await admin.from("notification_deliveries").insert({ event_id: event.id, user_id: userId, subscription_id: subscription.id }).select("id").single();
    if (error?.code === "23505") { skipped++; continue; }
    if (error || !delivery) { skipped++; continue; }
    try {
      const targetHash = String(event.url || "").includes("#") ? `#${String(event.url).split("#")[1]}` : "";
      await sendWebPush(subscription, { title: event.title, body: event.body, icon: "/icon-192.png", badge: "/logo-mark.png", tag: event.fingerprint.slice(0, 32), type: event.type, severity: event.severity, source: event.source, expiresAt: event.expires.toISOString(), url: `./?push_delivery=${delivery.id}${targetHash}`, deliveryId: delivery.id }, vapid, event.severity, pushUrgency(event.type, event.severity));
      await admin.from("notification_deliveries").update({ status: "accepted", sent_at: new Date().toISOString() }).eq("id", delivery.id);
      accepted++;
    } catch (error) {
      const failure = pushErrorCode(error);
      await admin.from("notification_deliveries").update({ status: failure.invalid ? "expired" : "failed", error_code: failure.code }).eq("id", delivery.id);
      if (failure.invalid) await admin.from("push_subscriptions").update({ enabled: false }).eq("id", subscription.id);
    }
  }
  return { accepted, skipped };
}

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const admin = adminClient(8_000);
  let token: string | null = null;
  let cursor: string | null = null;
  try {
    const vapid = await pushSecrets(admin);
    if (!constantTimeEqual(req.headers.get("x-pluvia-cron-secret") || "", vapid.cron_secret)) return json(req, { error: "Não autorizado." }, 401);
    const body: any = await readJson(req);
    if (body?.action !== "process") return json(req, { error: "Ação inválida." }, 400);

    const deadline = Date.now() + 90_000;
    const requestedToken = crypto.randomUUID();
    const { data: lease, error: leaseError } = await admin.rpc("pluvia_push_claim", { p_token: requestedToken });
    if (leaseError) throw new Error("worker_claim_failed");
    if (!lease?.length) return json(req, { ok: true, busy: true, locations: 0, events: 0, accepted: 0 });
    token = requestedToken;
    cursor = lease[0].cursor_id;
    const checkpoint = async (next: string | null) => {
      const { data, error } = await admin.rpc("pluvia_push_checkpoint", { p_token: token, p_cursor: next });
      if (error || data !== true) throw new Error("worker_checkpoint_failed");
      cursor = next;
    };
    const page = async (after: string | null) => {
      let query = admin.from("notification_locations").select("id,user_id,city_id,city_name,uf,latitude,longitude,timezone").eq("enabled", true).order("id").limit(100);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) throw new Error("worker_locations_failed");
      return data || [];
    };
    let locations = await page(cursor);
    if (!locations.length && cursor) {
      await checkpoint(null);
      locations = await page(null);
    }
    const userIds = [...new Set((locations || []).map((location: Location) => location.user_id))];
    if (!userIds.length) return json(req, { ok: true, locations: 0, events: 0, accepted: 0 });
    const [{ data: preferences, error: preferenceError }, { data: subscriptions, error: subscriptionError }] = await Promise.all([
      admin.from("notification_preferences").select("*").in("user_id", userIds),
      admin.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth,platform,browser,created_at,last_seen_at").in("user_id", userIds).eq("enabled", true),
    ]);
    if (preferenceError || subscriptionError) throw new Error("worker_accounts_failed");
    const preferencesByUser = new Map((preferences || []).map((row: Preference) => [row.user_id, row]));
    const subscriptionsByUser = new Map<string, any[]>();
    for (const subscription of subscriptions || []) subscriptionsByUser.set(subscription.user_id, [...(subscriptionsByUser.get(subscription.user_id) || []), subscription]);
    for (const [userId, list] of subscriptionsByUser) subscriptionsByUser.set(userId, activeSubscriptions(list));
    let inmetAlerts: any[] = [];
    if ([...preferencesByUser.values()].some((preference: any) => preference.notifications_enabled && preference.official_alerts)) {
      try { inmetAlerts = normalizeInmet(await fetchJson(INMET_URL)); } catch (error) {
        console.warn("INMET unavailable", { code: error instanceof Error ? error.message : "unknown" });
        report("push-process", "inmet_unavailable", { level: "warning" });
      }
    }
    let created = 0, accepted = 0, sourceFailures = 0, processed = 0;
    // Radar: metadados e telhas decodificadas compartilhados na rodada (cidades vizinhas usam as mesmas telhas).
    let radarMeta: Promise<any> | null = null;
    const tiles = new Map<string, Promise<Uint8Array>>();
    const tile = (url: string) => {
      if (!tiles.has(url)) tiles.set(url, fetchBytes(url).then(bytes => {
        const png = PNG.sync.read(Buffer.from(bytes));
        if (png.width !== 256 || png.height !== 256) throw new Error("source_invalid_response");
        return new Uint8Array(png.data);
      }));
      return tiles.get(url)!;
    };
    const nowcastFor = async (location: Location) => {
      radarMeta ||= fetchJson("https://api.rainviewer.com/public/weather-maps.json", 8_000);
      const meta = await radarMeta;
      const past = asArray(meta?.radar?.past), latest = past[past.length - 1];
      const earlier = latest && past.find((frame: any) => frame?.time === latest.time - FRAME_GAP_S);
      const host = latest?.host || meta?.host;
      if (!latest?.path || !earlier?.path || typeof host !== "string" || !/^https:\/\/[a-z0-9.-]+\.rainviewer\.com$/.test(host)) return null;
      const placed = windowTiles(location.longitude, location.latitude);
      const maskFor = async (path: string) => windowMask(await Promise.all(placed.map(async ({ tx, ty, ox, oy }) => ({ ox, oy, rgba: await tile(`${host}${path}/256/7/${tx}/${ty}/2/1_1.png`) }))));
      const [before, after] = await Promise.all([maskFor(earlier.path), maskFor(latest.path)]);
      return nowcastCandidate(estimateArrival(before, after, NOWCAST_SIZE, FRAME_GAP_S, location.latitude), latest.time * 1000, location);
    };
    // Vencedor de chuva por cidade, uma consulta por cidade por rodada; falha do placar = best_match.
    const rainModels = new Map<string, Promise<string | null>>();
    const rainModelFor = (cityId: string) => {
      if (!rainModels.has(cityId)) rainModels.set(cityId, Promise.resolve(admin.rpc("pluvia_rain_model", { p_city: cityId }))
        .then(({ data, error }: any) => !error && typeof data === "string" && /^[a-z0-9_]{2,40}$/.test(data) ? data : null).catch(() => null));
      return rainModels.get(cityId)!;
    };
    const sources = new Map<string, Promise<any>>();
    const source = (url: string) => {
      if (!sources.has(url)) sources.set(url, fetchJson(url));
      return sources.get(url)!;
    };

    for (const location of (locations || []) as Location[]) {
      if (Date.now() >= deadline) break;
      const preference = preferencesByUser.get(location.user_id);
      const userSubscriptions = subscriptionsByUser.get(location.user_id) || [];
      if (!preference || !userSubscriptions.length || !preference.notifications_enabled) {
        await checkpoint(location.id); processed++; continue;
      }
      let rainModel = "best_match";
      let weatherForNowcast: any = null;
      try {
        const candidates: EventCandidate[] = inmetForLocation(inmetAlerts, location);
        const needsWeather = ["rain_approaching", "heavy_rain", "storms", "strong_wind", "extreme_heat", "weather_changes", "daily_summary", "evening_summary"].some(key => preference[key]);
        if (needsWeather) try {
          let weather = await source(weatherUrl(location));
          if (!freshCurrent(weather, new Date())) throw new Error("source_invalid_current");
          // Chuva do modelo que mais acerta nesta cidade, quando o placar já tem um vencedor claro.
          const winner = await rainModelFor(location.city_id);
          if (winner) try {
            const swapped = withRainModel(weather, await source(rainModelUrl(location, winner)));
            if (swapped) { weather = swapped; rainModel = winner; }
          } catch { /* fica o best_match */ }
          candidates.push(...detectWeather(weather, location));
          weatherForNowcast = weather;
          const summary = dailySummaryCandidate(weather, location, preference);
          if (summary) candidates.push(summary);
          const evening = eveningSummaryCandidate(weather, location, preference);
          if (evening) candidates.push(evening);
        } catch (error) {
          sourceFailures++;
          console.warn("weather source unavailable", { cityId: location.city_id, code: error instanceof Error ? error.message : "unknown" });
        }
        if (Date.now() >= deadline) throw new Error("worker_budget");
        let raining = false;
        if (preference.rain_approaching || preference.storms) {
          // Estação e aeroporto: um falhar não impede o outro, e nenhum dos dois derruba os demais avisos.
          const observedAt = Date.now();
          const [stationResult, airportResult] = await Promise.allSettled([
            source(stationUrl(location.latitude, location.longitude, observedAt)),
            source(metarUrl(location.latitude, location.longitude)),
          ]);
          let station = null, airport = null;
          try { if (stationResult.status === "fulfilled") station = normalizeStation(stationResult.value, location.latitude, location.longitude, observedAt); } catch { /* sem estação */ }
          try { if (airportResult.status === "fulfilled") airport = nearestAirport(airportResult.value, location.latitude, location.longitude, observedAt); } catch { /* sem aeroporto */ }
          if (stationResult.status === "rejected" && airportResult.status === "rejected") sourceFailures++;
          candidates.push(...detectObserved({ station, airport }, location));
          raining = rainingNow({ station, airport });
        }
        if (Date.now() >= deadline) throw new Error("worker_budget");
        // Chuva a caminho pelo radar: sem chuva medida agora e com o modelo vendo chance nas próximas 3 h.
        if (preference.rain_approaching && !raining && weatherForNowcast && rainLikelySoon(weatherForNowcast)) {
          try {
            const incoming = await nowcastFor(location);
            if (incoming) candidates.push(incoming);
          } catch { /* sem radar, sem aviso */ }
        }
        if (Date.now() >= deadline) throw new Error("worker_budget");
        if (preference.air_quality) {
          try {
            const airEvent = detectAirQuality(await source(airQualityUrl(location)), location);
            if (airEvent) candidates.push(airEvent);
          } catch (error) { console.warn("air quality unavailable", { cityId: location.city_id, code: error instanceof Error ? error.message : "unknown" }); }
        }
        const enabledCandidates = candidates.filter(candidate => !preferenceFor[candidate.type] || preference[preferenceFor[candidate.type]]);
        let selected = selectCandidates(enabledCandidates, { raining });
        if (selected.some(candidate => ["rain_approaching", "heavy_rain"].includes(candidate.type))) {
          // Falha dos outros modelos não segura o aviso: ele sai sem a frase de concordância.
          try {
            const others = await source(agreementUrl(location));
            selected = selected.map(candidate => withAgreement(candidate, others, rainModel));
          } catch { /* sem concordância */ }
        }
        if (rainModel !== "best_match") selected = selected.map(candidate => ["rain_approaching", "heavy_rain", "weather_change"].includes(candidate.type) ? { ...candidate, metadata: { ...candidate.metadata, rain_model: rainModel } } : candidate);
        for (const candidate of selected) {
          if (Date.now() >= deadline) throw new Error("worker_budget");
          const event = await createEvent(admin, location, candidate);
          if (event.created) created++;
          const result = await deliver(admin, event, preference, userSubscriptions, location.user_id, vapid, deadline);
          accepted += result.accepted;
          if (result.deferred) throw new Error("worker_budget");
        }
      } catch (error) {
        if (error instanceof Error && error.message === "worker_budget") break;
        sourceFailures++;
        console.warn("weather location failed", { code: "location_processing_failed" });
      }
      await checkpoint(location.id);
      processed++;
    }

    // Uma falha por rodada, com a contagem: cidade e usuário nunca saem daqui.
    if (sourceFailures) report("push-process", "source_failures", { level: "warning", count: sourceFailures });
    if (Date.now() < deadline) await admin.from("push_subscriptions").delete().eq("enabled", false).lt("updated_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
    if (Date.now() < deadline) await admin.from("notification_events").delete().lt("expires_at", new Date(Date.now() - 90 * 86_400_000).toISOString());
    return json(req, { ok: true, locations: processed, selected: locations.length, budgetExhausted: processed < locations.length, events: created, accepted, sourceFailures });
  } catch (error) {
    const code = error instanceof Error ? error.message : "worker_failed";
    console.error("push-process failed", { code });
    report("push-process", code);
    return json(req, { error: "Processamento temporariamente indisponível.", diagnostic_code: text(code, 80) }, 503);
  } finally {
    if (token) {
      try {
        const { data, error } = await admin.rpc("pluvia_push_checkpoint", { p_token: token, p_cursor: cursor, p_release: true });
        if (error || data !== true) console.warn("push-process lease release failed", { code: "worker_release_failed" });
      } catch { console.warn("push-process lease release failed", { code: "worker_release_failed" }); }
    }
  }
});
