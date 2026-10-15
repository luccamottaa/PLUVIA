// Placar de acerto da previsão (pedido do usuário, outubro/2026). Chamada só pelo cron de hora em hora
// (segredo do Vault no cabeçalho). Guarda a previsão de quatro modelos do Open-Meteo para as 27 capitais,
// 6 h e 24 h à frente (com a probabilidade de chuva), a resposta "Vai chover?" de cada modelo para as
// próximas 3 h e 12 h, e a última hora medida pela estação do INMET mais próxima de cada uma. A
// comparação fica nas views private.forecast_scores e private.forecast_window_scores; nada vai para o app.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, pushSecrets } from "../_shared/supabase.ts";
import { json, preflight, readJson } from "../_shared/http.ts";
import { report } from "../_shared/error-report.js";
import { stationUrl, normalizeStation } from "../_shared/inmet-station.js";
import { CAPITALS, forecastUrl, buildSamples, buildWindows, observationFrom } from "../_shared/forecast-verify.js";

const USER_AGENT = "PLUVIA/1.0 (https://pluviaweather.com.br; https://github.com/luccamottaa/PLUVIA)";

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function getJson(url: string, timeout = 15_000) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error("provider_unavailable");
  return response.json();
}

// Uma consulta por capital ao nó WIS2 do INMET, de 6 em 6, para não disparar 27 de uma vez.
async function observations(now: number) {
  const result: unknown[] = [];
  let failures = 0;
  for (let start = 0; start < CAPITALS.length; start += 6) {
    const batch = CAPITALS.slice(start, start + 6);
    const settled = await Promise.allSettled(batch.map(async city => {
      const data = await getJson(stationUrl(city.lat, city.lon, now), 10_000);
      return observationFrom(city, normalizeStation(data, city.lat, city.lon, now));
    }));
    for (const item of settled) {
      if (item.status === "fulfilled") { if (item.value) result.push(item.value); }
      else failures++;
    }
  }
  return { list: result, failures };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const admin = adminClient(10_000);
  try {
    const secrets = await pushSecrets(admin);
    if (!constantTimeEqual(req.headers.get("x-pluvia-cron-secret") || "", secrets.cron_secret)) return json(req, { error: "Não autorizado." }, 401);
    const body: any = await readJson(req);
    if (body?.action !== "verify") return json(req, { error: "Ação inválida." }, 400);
    const now = Date.now();
    const [forecast, observed] = await Promise.allSettled([getJson(forecastUrl(), 20_000), observations(now)]);
    const samples = forecast.status === "fulfilled" ? buildSamples(forecast.value, CAPITALS, now) : [];
    const windows = forecast.status === "fulfilled" ? buildWindows(forecast.value, CAPITALS, now) : [];
    const stations = observed.status === "fulfilled" ? observed.value : { list: [], failures: CAPITALS.length };
    if (forecast.status === "rejected") report("forecast-verify", "forecast_unavailable", { level: "warning" });
    if (stations.failures > 0) report("forecast-verify", "station_failures", { level: "warning", count: stations.failures });
    const { data, error } = await admin.rpc("pluvia_verify_store", { samples, observations: stations.list, windows });
    if (error) { report("forecast-verify", "store_failed"); return json(req, { ok: false, error: "store_failed" }, 500); }
    return json(req, { ok: true, stored: data, stationFailures: stations.failures, forecast: forecast.status === "fulfilled" });
  } catch (error) {
    report("forecast-verify", error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : "unexpected");
    return json(req, { ok: false, error: "unexpected" }, 500);
  }
});
