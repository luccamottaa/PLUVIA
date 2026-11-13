import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { report } from "../_shared/error-report.js";
import { adminClient, authenticatedUser, pushSecrets, retryPause } from "../_shared/supabase.ts";
import { json, preflight, readJson } from "../_shared/http.ts";
import { allowedPushEndpoint } from "../_shared/push-endpoint.ts";

const clean = (value: unknown, max = 80) => String(value || "").trim().slice(0, max);
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function validTimezone(value: string) {
  try { new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format(); return true; } catch { return false; }
}

function subscriptionInput(raw: any) {
  const endpoint = clean(raw?.endpoint, 2048);
  const p256dh = clean(raw?.keys?.p256dh, 180);
  const auth = clean(raw?.keys?.auth, 100);
  if (!allowedPushEndpoint(endpoint) || !/^[A-Za-z0-9_-]{40,180}$/.test(p256dh) || !/^[A-Za-z0-9_-]{10,100}$/.test(auth)) throw new Error("invalid_subscription");
  return { endpoint, p256dh, auth };
}

function locationInput(raw: any) {
  if (!raw) return null;
  const city_id = clean(raw.cityId, 80), city_name = clean(raw.cityName, 100), uf = clean(raw.uf, 2).toUpperCase();
  const latitude = typeof raw.latitude === "number" ? raw.latitude : NaN;
  const longitude = typeof raw.longitude === "number" ? raw.longitude : NaN;
  const timezone = clean(raw.timezone, 64);
  const source = ["saved_city", "searched_city", "gps_city"].includes(raw.source) ? raw.source : "saved_city";
  if (!/^\d{7}$/.test(city_id) || !city_name || !/^[A-Z]{2}$/.test(uf) || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !validTimezone(timezone)) throw new Error("invalid_location");
  return { city_id, city_name, uf, latitude, longitude, timezone, source, enabled: true };
}

// "Minha localização" (1.74): o ponto chega já arredondado pelo app e é arredondado de novo aqui para duas
// casas decimais (~1,1 km). Usa a mesma validação de cidade (IBGE, nome, UF e fuso do município).
const round2 = (value: number) => Math.round(value * 100) / 100;
function pointInput(raw: any) {
  const parsed = locationInput(raw);
  if (!parsed) throw new Error("invalid_location");
  return { ...parsed, latitude: round2(parsed.latitude), longitude: round2(parsed.longitude), source: "gps_city", kind: "point" };
}

// Sem a coluna/chave nova (função publicada antes da migration 20261113120000), volta à chave antiga.
const legacySchema = (error: any) => ["42P10", "42703", "PGRST204"].includes(String(error?.code || ""));
async function upsertCities(admin: any, userId: string, rows: any[]) {
  if (!rows.length) return;
  const { error } = await admin.from("notification_locations").upsert(rows.map(row => ({ user_id: userId, ...row, kind: "city" })), { onConflict: "user_id,city_id,kind" });
  if (!error) return;
  if (!legacySchema(error)) throw error;
  const { error: legacyError } = await admin.from("notification_locations").upsert(rows.map(row => ({ user_id: userId, ...row })), { onConflict: "user_id,city_id" });
  if (legacyError) throw legacyError;
}

function preferencesInput(raw: any) {
  const fields = ["notifications_enabled", "official_alerts", "rain_approaching", "heavy_rain", "storms", "lightning", "strong_wind", "extreme_heat", "air_quality", "weather_changes", "daily_summary", "evening_summary", "flood_risk", "rain_easing"];
  const next: Record<string, unknown> = {};
  for (const field of fields) if (typeof raw?.[field] === "boolean") next[field] = raw[field];
  const severity = Number(raw?.minimum_severity);
  if (Number.isInteger(severity) && severity >= 1 && severity <= 4) next.minimum_severity = severity;
  // Limite diário de avisos fracos (1.73.14): 0 = sem limite; os valores da tela são 0, 2, 4 e 8.
  const cap = Number(raw?.low_daily_cap);
  if (Number.isInteger(cap) && cap >= 0 && cap <= 20) next.low_daily_cap = cap;
  for (const field of ["quiet_start", "quiet_end", "daily_summary_time", "evening_summary_time"]) {
    const value = raw?.[field];
    if (value === null && !field.endsWith("_summary_time")) next[field] = null;
    else if (timePattern.test(String(value || ""))) next[field] = value;
  }
  const timezone = clean(raw?.timezone, 64);
  if (timezone && validTimezone(timezone)) next.timezone = timezone;
  return next;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const user = await authenticatedUser(req);
  if (!user) return json(req, { error: "Entre na sua conta para configurar alertas." }, 401);
  const admin = adminClient();

  try {
    const body: any = await readJson(req);
    const action = clean(body?.action, 32);

    if (action === "config") {
      const lookup = () => Promise.all([
        admin.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
        admin.from("push_subscriptions").select("id,device_name,platform,browser,last_seen_at,enabled").eq("user_id", user.id).order("last_seen_at", { ascending: false }),
        admin.from("notification_locations").select("id,city_id,city_name,uf,timezone,source,enabled,kind").eq("user_id", user.id).order("updated_at", { ascending: false }),
      ]);
      const failed = (results: any[]) => results.some(result => result.error);
      const [readings, secrets] = await Promise.all([lookup().then(async results => failed(results) ? (await retryPause(), lookup()) : results), pushSecrets(admin)]);
      const [preferenceResult, deviceResult, locationResult] = readings;
      if (failed(readings)) throw new Error("config_lookup_failed");
      const preferences=preferenceResult.data,devices=deviceResult.data,locations=locationResult.data;
      return json(req, { publicKey: secrets.vapid_public_key, preferences, devices: devices || [], locations: locations || [] });
    }

    if (action === "register") {
      const subscription = subscriptionInput(body.subscription);
      const device_name = clean(body.device?.name, 80) || "Navegador";
      const platform = clean(body.device?.platform, 40) || "web";
      const browser = clean(body.device?.browser, 40) || "unknown";
      const { data: saved, error } = await admin.from("push_subscriptions").upsert({
        user_id: user.id, ...subscription, device_name, platform, browser, enabled: true, last_seen_at: new Date().toISOString(),
      }, { onConflict: "endpoint" }).select("id").single();
      if (error) throw error;
      await admin.from("notification_preferences").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
      const location = locationInput(body.location);
      if (location) await upsertCities(admin, user.id, [location]);
      return json(req, { ok: true, subscriptionId: saved.id });
    }

    if (action === "preferences") {
      const preferences = preferencesInput(body.preferences);
      const location = locationInput(body.location);
      if (body.locations !== undefined && (!Array.isArray(body.locations) || body.locations.length>30)) throw new Error("invalid_location");
      const requested=(body.locations || []).map((value: any) => {
        const parsed=locationInput(value);if(!parsed) throw new Error("invalid_location");return parsed;
      });
      if (location) requested.push(location);
      const locations=[...new Map(requested.map((item: any)=>[item.city_id,item])).values()] as any[];
      if (locations.length>30) throw new Error("invalid_location");
      const { error } = await admin.from("notification_preferences").upsert({ user_id: user.id, ...preferences }, { onConflict: "user_id" });
      if (error) throw error;
      await upsertCities(admin, user.id, locations);
      return json(req, { ok: true });
    }

    // Um ponto por usuário: atualiza o que existe ou cria. Sem a migration, responde "indisponível".
    if (action === "point") {
      const point = pointInput(body.point);
      const { data: existing, error: lookupError } = await admin.from("notification_locations").select("id").eq("user_id", user.id).eq("kind", "point").limit(1);
      if (lookupError) throw new Error(legacySchema(lookupError) ? "point_unsupported" : "point_lookup_failed");
      const { error } = existing?.length
        ? await admin.from("notification_locations").update({ ...point, enabled: true }).eq("id", existing[0].id).eq("user_id", user.id)
        : await admin.from("notification_locations").insert({ user_id: user.id, ...point });
      if (error) throw error;
      return json(req, { ok: true });
    }

    if (action === "remove_point") {
      const { error } = await admin.from("notification_locations").delete().eq("user_id", user.id).eq("kind", "point");
      if (error && !legacySchema(error)) throw error;
      return json(req, { ok: true });
    }

    if (action === "remove") {
      const id = clean(body.subscriptionId, 36);
      const { error } = await admin.from("push_subscriptions").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
      return json(req, { ok: true });
    }

    if (action === "remove_location") {
      const id = clean(body.locationId, 36);
      const { error } = await admin.from("notification_locations").delete().eq("id", id).eq("user_id", user.id);
      if (error) throw error;
      return json(req, { ok: true });
    }

    if (action === "opened") {
      const id = clean(body.deliveryId, 36);
      await admin.from("notification_deliveries").update({ opened_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
      return json(req, { ok: true });
    }

    return json(req, { error: "Ação inválida." }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "request_failed";
    if (["invalid_subscription", "invalid_location", "payload_too_large"].includes(code)) return json(req, { error: "Os dados enviados não são válidos." }, 400);
    if (code === "point_unsupported") return json(req, { error: "Avisos na sua localização ainda não estão disponíveis." }, 409);
    console.error("push-subscriptions failed", { code });
    report("push-subscriptions", code);
    return json(req, { error: "Não foi possível salvar as notificações agora." }, 503);
  }
});
