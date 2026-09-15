import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, pushSecrets } from "../_shared/supabase.ts";
import { json, preflight, readJson } from "../_shared/http.ts";
import { pushErrorCode, sendWebPush } from "../_shared/webpush.ts";

type Location = { id: string; user_id: string; city_id: string; city_name: string; uf: string; latitude: number; longitude: number; timezone: string };
type Preference = Record<string, any> & { user_id: string };
type EventCandidate = { type: string; severity: number; title: string; body: string; source: string; start: Date; expires: Date; url: string; fingerprintSeed: string; metadata?: Record<string, unknown> };

const INMET_URL = "https://apiprevmet3.inmet.gov.br/avisos/ativos";
const preferenceFor: Record<string, string> = {
  official_alert: "official_alerts", rain_approaching: "rain_approaching", heavy_rain: "heavy_rain", storm: "storms",
  lightning: "lightning", strong_wind: "strong_wind", extreme_heat: "extreme_heat", air_quality: "air_quality",
  weather_change: "weather_changes", daily_summary: "daily_summary",
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
    return await response.json();
  } finally { clearTimeout(timer); }
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
    latitude: String(location.latitude), longitude: String(location.longitude), timezone: "GMT", timeformat: "unixtime", forecast_days: "2",
    current: "temperature_2m,apparent_temperature,precipitation,weather_code,wind_gusts_10m",
    hourly: "temperature_2m,precipitation_probability,precipitation,weather_code,wind_gusts_10m",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  }).toString();
  return url.toString();
}

function airQualityUrl(location: Location) {
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.search = new URLSearchParams({
    latitude: String(location.latitude), longitude: String(location.longitude), timezone: "GMT", forecast_days: "1",
    current: "us_aqi,pm2_5,pm10",
  }).toString();
  return url.toString();
}

function detectAirQuality(data: any, location: Location, now = new Date()) {
  const aqi = Math.round(Number(data?.current?.us_aqi));
  if (!Number.isFinite(aqi) || aqi < 101) return null;
  const severity = aqi >= 201 ? 4 : aqi >= 151 ? 3 : 2;
  const guidance = severity >= 3 ? "Reduza esforço prolongado ao ar livre, especialmente se você faz parte de um grupo sensível." : "Pessoas sensíveis podem preferir reduzir esforço prolongado ao ar livre.";
  return {
    type: "air_quality", severity, title: "🌫️ Qualidade do ar em atenção",
    body: `O índice de qualidade do ar está em ${aqi} na região de ${location.city_name}. ${guidance}`,
    source: "Open-Meteo · modelo CAMS", start: now, expires: new Date(now.getTime() + 6 * 3_600_000), url: "./#qualidade-do-ar",
    fingerprintSeed: `air_quality|${location.city_id}|${Math.floor(now.getTime() / 21_600_000)}|${severity}`,
    metadata: { us_aqi: aqi, pm2_5: Number(data?.current?.pm2_5), pm10: Number(data?.current?.pm10), confidence: "moderate" },
  } satisfies EventCandidate;
}

function detectWeather(data: any, location: Location, now = new Date()) {
  const events: EventCandidate[] = [];
  const currentTime = Number(data?.current?.time || Math.floor(now.getTime() / 1000));
  const times = asArray(data?.hourly?.time).map(Number);
  const upcoming = times.map((time: number, index: number) => ({
    time, probability: Number(data.hourly.precipitation_probability?.[index] || 0), precipitation: Number(data.hourly.precipitation?.[index] || 0),
    code: Number(data.hourly.weather_code?.[index] || 0), gust: Number(data.hourly.wind_gusts_10m?.[index] || 0),
    temperature: Number(data.hourly.temperature_2m?.[index]),
  })).filter((row: any) => row.time >= currentTime - 1800).slice(0, 7);
  const next3h = upcoming.slice(0, 4);
  const peakRain = Math.max(0, ...next3h.map((row: any) => row.precipitation));
  const peakProbability = Math.max(0, ...next3h.map((row: any) => row.probability));
  const peakGust = Math.max(Number(data?.current?.wind_gusts_10m || 0), ...next3h.map((row: any) => row.gust));
  const futurePeakGust = Math.max(Number(data?.current?.wind_gusts_10m || 0), ...upcoming.map((row: any) => row.gust));
  const stormCode = Math.max(Number(data?.current?.weather_code || 0), ...next3h.map((row: any) => row.code));
  const currentRain = Number(data?.current?.precipitation || 0);
  const apparent = Number(data?.current?.apparent_temperature || 0), temperature = Number(data?.current?.temperature_2m || 0);
  const bucket = Math.floor(now.getTime() / 21_600_000);
  const end2h = new Date(now.getTime() + 2 * 3_600_000), end3h = new Date(now.getTime() + 3 * 3_600_000);

  if (currentRain < 0.2 && next3h.slice(1, 3).some((row: any) => row.precipitation >= 0.5 && row.probability >= 60)) events.push({
    type: "rain_approaching", severity: 2, title: "🌧️ Chuva nas próximas horas",
    body: `O modelo indica chuva na região de ${location.city_name} nas próximas horas — não é radar nem minuto exato. Vale levar guarda-chuva.`, source: "Open-Meteo · modelo",
    start: now, expires: end2h, url: "./#chuva", fingerprintSeed: `rain_approaching|${location.city_id}|${bucket}|2`, metadata: { peak_probability: peakProbability, peak_mm_h: peakRain, confidence: "moderate" },
  });
  if (peakRain >= 5 && peakProbability >= 70) {
    const severity = peakRain >= 15 ? 4 : 3;
    events.push({ type: "heavy_rain", severity, title: "🌧️ Chuva forte prevista", body: `O modelo indica chuva forte em ${location.city_name} nas próximas horas. Acompanhe alertas oficiais e evite áreas alagáveis.`, source: "Open-Meteo · modelo", start: now, expires: end3h, url: "./#chuva", fingerprintSeed: `heavy_rain|${location.city_id}|${bucket}|${severity}`, metadata: { peak_probability: peakProbability, peak_mm_h: peakRain, confidence: "moderate" } });
  }
  if (stormCode >= 95) {
    const severity = stormCode >= 99 ? 4 : 3;
    events.push({ type: "storm", severity, title: "⛈️ Tempestade possível", body: `Há sinal de tempestade no modelo para ${location.city_name}. Raios, chuva intensa e rajadas podem ocorrer nas próximas horas.`, source: "Open-Meteo · modelo", start: now, expires: end3h, url: "./#alertas", fingerprintSeed: `storm|${location.city_id}|${bucket}|${severity}`, metadata: { weather_code: stormCode, confidence: "moderate" } });
  }
  if (peakGust >= 60) {
    const severity = peakGust >= 90 ? 4 : 3;
    events.push({ type: "strong_wind", severity, title: "💨 Rajadas fortes possíveis", body: `Rajadas de até cerca de ${Math.round(peakGust)} km/h aparecem na previsão para ${location.city_name}. Proteja objetos soltos e acompanhe avisos oficiais.`, source: "Open-Meteo · modelo", start: now, expires: end3h, url: "./#agora", fingerprintSeed: `strong_wind|${location.city_id}|${bucket}|${severity}`, metadata: { peak_gust_kmh: peakGust, confidence: "moderate" } });
  }
  if (apparent >= 42 || temperature >= 40) {
    const severity = apparent >= 48 || temperature >= 43 ? 4 : 3;
    events.push({ type: "extreme_heat", severity, title: "🌡️ Calor intenso", body: `A sensação térmica está em torno de ${Math.round(apparent)} °C em ${location.city_name}. Hidrate-se e reduza esforço sob o sol.`, source: "Open-Meteo · modelo", start: now, expires: end3h, url: "./#agora", fingerprintSeed: `extreme_heat|${location.city_id}|${bucket}|${severity}`, metadata: { temperature_c: temperature, apparent_c: apparent, confidence: "moderate" } });
  }
  const futureTemperatures = upcoming.slice(1).map((row: any) => row.temperature).filter(Number.isFinite);
  const temperatureDelta = futureTemperatures.length && Number.isFinite(temperature)
    ? futureTemperatures.reduce((largest: number, value: number) => Math.abs(value - temperature) > Math.abs(largest) ? value - temperature : largest, 0)
    : 0;
  const dryNow = currentRain < 0.2 && Number(data?.current?.weather_code || 0) < 51;
  const rainTransition = dryNow && upcoming.slice(3).some((row: any) => row.precipitation >= 1 && row.probability >= 60);
  const windTransition = Number(data?.current?.wind_gusts_10m || 0) < 35 && futurePeakGust >= 55;
  if (Math.abs(temperatureDelta) >= 6 || rainTransition || windTransition) {
    const reasons = [
      Math.abs(temperatureDelta) >= 6 ? `a temperatura pode ${temperatureDelta < 0 ? "cair" : "subir"} cerca de ${Math.round(Math.abs(temperatureDelta))} °C` : "",
      rainTransition ? "a chuva ganha força mais tarde" : "",
      windTransition ? "as rajadas podem aumentar bastante" : "",
    ].filter(Boolean);
    events.push({
      type: "weather_change", severity: windTransition || Math.abs(temperatureDelta) >= 9 ? 3 : 2, title: "🌦️ Mudança relevante no tempo",
      body: `O modelo indica mudança nas próximas 6 horas em ${location.city_name}: ${reasons.join(" e ")}. A previsão pode mudar nas próximas atualizações.`,
      source: "Open-Meteo · modelo", start: now, expires: new Date(now.getTime() + 6 * 3_600_000), url: "./#previsao",
      fingerprintSeed: `weather_change|${location.city_id}|${bucket}|${reasons.map(reason => reason.split(" ").slice(0, 3).join("_")).join("|")}`,
      metadata: { temperature_delta_c: Math.round(temperatureDelta * 10) / 10, rain_transition: rainTransition, wind_transition: windTransition, confidence: "moderate" },
    });
  }
  return events;
}

function normalizeInmet(raw: any) {
  const rows = Array.isArray(raw) ? raw : raw && (Array.isArray(raw.hoje) || Array.isArray(raw.futuro)) ? [...asArray(raw.hoje), ...asArray(raw.futuro)] : asArray(raw?.avisos || raw?.alerts || raw?.data || raw?.features);
  return rows.map((row: any) => row?.properties || row).filter(Boolean);
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

function inmetForLocation(alerts: any[], location: Location, now = new Date()) {
  return alerts.flatMap((alert: any) => {
    if ([true, 1, "1", "true"].includes(alert.encerrado) || /cancel/i.test(String(alert.msgType || ""))) return [];
    const codes = JSON.stringify(alert.geocodes || alert.geocode || "").match(/\b\d{7}\b/g) || [];
    const towns = normalize(JSON.stringify(alert.municipios || alert.municipio || ""));
    const region = normalize(JSON.stringify([alert.estados, alert.uf, alert.sigla, alert.area, alert.areaDesc]));
    const tokens = region.split(/[^a-z0-9]+/).filter(Boolean);
    const normalizedCity = normalize(location.city_name), normalizedUf = normalize(location.uf);
    const cityMatch = codes.includes(location.city_id) || (towns.includes(normalizedCity) && (tokens.includes(normalizedUf) || region.includes(normalizedCity)));
    if (!cityMatch) return [];
    const end = parseInmetDate(alert, "fim") || new Date(now.getTime() + 6 * 3_600_000), start = parseInmetDate(alert, "inicio") || now;
    if (end <= now || start > new Date(now.getTime() + 24 * 3_600_000)) return [];
    const severityText = normalize(first(alert, ["severidade", "severity", "nivel"]));
    const color = normalize(first(alert, ["aviso_cor", "cor"]));
    const severity = severityText.includes("grande perigo") || color.includes("ff0000") ? 4 : severityText === "perigo" || color.includes("f96602") || color.includes("ffa500") ? 3 : 2;
    const severityLabel = severity === 4 ? "Grande perigo" : severity === 3 ? "Perigo" : "Perigo potencial";
    const id = text(first(alert, ["id_aviso", "id", "identifier"], `${location.city_id}-${start.toISOString()}`), 100);
    const phenomenon = text(first(alert, ["descricao", "evento", "titulo", "tipo"], "Aviso meteorológico"), 100);
    const risk = text(first(alert, ["riscos", "description"], "Consulte os riscos e as orientações no aviso oficial."), 260);
    const validUntil = new Intl.DateTimeFormat("pt-BR", { timeZone: location.timezone, hour: "2-digit", minute: "2-digit" }).format(end);
    return [{ type: "official_alert", severity, title: `⚠️ ${phenomenon}`, body: `${severityLabel} em ${location.city_name}, ${location.uf}, válido até ${validUntil}. ${risk} Fonte: INMET.`, source: "INMET · alerta oficial", start, expires: end, url: "./#alertas", fingerprintSeed: `official_alert|${id}|${location.city_id}|${severity}`, metadata: { official_id: id, area: `${location.city_name}, ${location.uf}`, severity_label: severityLabel, valid_until: end.toISOString(), confidence: "high" } } satisfies EventCandidate];
  });
}

function dailySummaryCandidate(data: any, location: Location, preference: Preference, now = new Date()) {
  if (!preference.daily_summary) return null;
  const target = String(preference.daily_summary_time || "07:00").slice(0, 5);
  const [hour, minute] = target.split(":").map(Number), current = localMinutes(location.timezone, now);
  if (Math.abs(current - (hour * 60 + minute)) > 4) return null;
  const max = Math.round(Number(data?.daily?.temperature_2m_max?.[0])), min = Math.round(Number(data?.daily?.temperature_2m_min?.[0])), rain = Math.round(Number(data?.daily?.precipitation_probability_max?.[0] || 0));
  if (![max, min, rain].every(Number.isFinite)) return null;
  const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: location.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return { type: "daily_summary", severity: 1, title: `☀️ ${location.city_name} hoje`, body: `Máxima de ${max} °C, mínima de ${min} °C e até ${rain}% de chance de chuva.`, source: "Open-Meteo · modelo", start: now, expires: new Date(now.getTime() + 6 * 3_600_000), url: "./#previsao", fingerprintSeed: `daily_summary|${location.city_id}|${localDay}`, metadata: { max_c: max, min_c: min, rain_probability: rain, confidence: "moderate" } } satisfies EventCandidate;
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
    return { ...candidate, id: existing.id, fingerprint, created: false };
  }
  if (error) throw error;
  return { ...candidate, id: data.id, fingerprint, created: true };
}

async function deliver(admin: any, event: any, preference: Preference, subscriptions: any[], userId: string, vapid: any) {
  const flag = preferenceFor[event.type];
  const belowMinimum = event.type !== "daily_summary" && event.severity < Number(preference.minimum_severity || 1);
  if (!preference.notifications_enabled || (flag && !preference[flag]) || belowMinimum || inQuietHours(preference, event.severity)) return { accepted: 0, skipped: subscriptions.length };
  let accepted = 0, skipped = 0;
  for (const subscription of subscriptions) {
    const { data: delivery, error } = await admin.from("notification_deliveries").insert({ event_id: event.id, user_id: userId, subscription_id: subscription.id }).select("id").single();
    if (error?.code === "23505") { skipped++; continue; }
    if (error || !delivery) { skipped++; continue; }
    try {
      const targetHash = String(event.url || "").includes("#") ? `#${String(event.url).split("#")[1]}` : "";
      await sendWebPush(subscription, { title: event.title, body: event.body, icon: "/icon-192.png", badge: "/logo-mark.png", tag: event.fingerprint.slice(0, 32), type: event.type, severity: event.severity, source: event.source, expiresAt: event.expires.toISOString(), url: `./?push_delivery=${delivery.id}${targetHash}`, deliveryId: delivery.id }, vapid, event.severity);
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
  const admin = adminClient();
  try {
    const vapid = await pushSecrets(admin);
    if (!constantTimeEqual(req.headers.get("x-pluvia-cron-secret") || "", vapid.cron_secret)) return json(req, { error: "Não autorizado." }, 401);
    const body: any = await readJson(req);
    if (body?.action !== "process") return json(req, { error: "Ação inválida." }, 400);

    const { data: locations, error: locationError } = await admin.from("notification_locations").select("id,user_id,city_id,city_name,uf,latitude,longitude,timezone").eq("enabled", true).limit(100);
    if (locationError) throw locationError;
    const userIds = [...new Set((locations || []).map((location: Location) => location.user_id))];
    if (!userIds.length) return json(req, { ok: true, locations: 0, events: 0, accepted: 0 });
    const [{ data: preferences }, { data: subscriptions }] = await Promise.all([
      admin.from("notification_preferences").select("*").in("user_id", userIds),
      admin.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").in("user_id", userIds).eq("enabled", true),
    ]);
    const preferencesByUser = new Map((preferences || []).map((row: Preference) => [row.user_id, row]));
    const subscriptionsByUser = new Map<string, any[]>();
    for (const subscription of subscriptions || []) subscriptionsByUser.set(subscription.user_id, [...(subscriptionsByUser.get(subscription.user_id) || []), subscription]);
    let inmetAlerts: any[] = [];
    try { inmetAlerts = normalizeInmet(await fetchJson(INMET_URL)); } catch (error) { console.warn("INMET unavailable", { code: error instanceof Error ? error.message : "unknown" }); }
    let created = 0, accepted = 0, sourceFailures = 0;

    for (const location of (locations || []) as Location[]) {
      const preference = preferencesByUser.get(location.user_id);
      const userSubscriptions = subscriptionsByUser.get(location.user_id) || [];
      if (!preference || !userSubscriptions.length || !preference.notifications_enabled) continue;
      try {
        const weather = await fetchJson(weatherUrl(location));
        const candidates = [...detectWeather(weather, location), ...inmetForLocation(inmetAlerts, location)];
        if (preference.air_quality) {
          try {
            const airEvent = detectAirQuality(await fetchJson(airQualityUrl(location)), location);
            if (airEvent) candidates.push(airEvent);
          } catch (error) { console.warn("air quality unavailable", { cityId: location.city_id, code: error instanceof Error ? error.message : "unknown" }); }
        }
        const summary = dailySummaryCandidate(weather, location, preference);
        if (summary) candidates.push(summary);
        for (const candidate of candidates) {
          const event = await createEvent(admin, location, candidate);
          if (event.created) created++;
          const result = await deliver(admin, event, preference, userSubscriptions, location.user_id, vapid);
          accepted += result.accepted;
        }
      } catch (error) {
        sourceFailures++;
        console.warn("weather location failed", { cityId: location.city_id, code: error instanceof Error ? error.message : "unknown" });
      }
    }

    await admin.from("push_subscriptions").delete().eq("enabled", false).lt("updated_at", new Date(Date.now() - 30 * 86_400_000).toISOString());
    await admin.from("notification_events").delete().lt("expires_at", new Date(Date.now() - 90 * 86_400_000).toISOString());
    return json(req, { ok: true, locations: locations?.length || 0, events: created, accepted, sourceFailures });
  } catch (error) {
    const code = error instanceof Error ? error.message : "worker_failed";
    console.error("push-process failed", { code });
    return json(req, { error: "Processamento temporariamente indisponível.", diagnostic_code: text(code, 80) }, 503);
  }
});
