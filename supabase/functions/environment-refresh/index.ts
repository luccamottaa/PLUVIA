// Nível dos rios (ANA) e focos de calor (INPE), pedido do usuário em outubro/2026. Chamada só pelo cron
// (segredo do Vault no cabeçalho): baixa as fontes públicas e guarda um resumo em
// private.environment_snapshots. O app lê o resumo da cidade aberta pelo RPC pluvia_city_environment.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, pushSecrets } from "../_shared/supabase.ts";
import { json, preflight, readJson } from "../_shared/http.ts";
import { report } from "../_shared/error-report.js";
import { RIVER_STATIONS, anaUrl, parseAna, inpeUrls, parseFires } from "../_shared/environment.js";

const USER_AGENT = "PLUVIA/1.0 (https://pluviaweather.com.br; https://github.com/luccamottaa/PLUVIA)";

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function getText(url: string, timeout: number) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(timeout) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("provider_unavailable");
  return response.text();
}

// Três estações por vez: a ANA responde 429 com muitas consultas simultâneas.
async function rivers(now: number) {
  const data: Record<string, unknown> = {};
  let failures = 0;
  for (let start = 0; start < RIVER_STATIONS.length; start += 3) {
    const batch = RIVER_STATIONS.slice(start, start + 3);
    const settled = await Promise.allSettled(batch.map(async station => ({ station, reading: parseAna(await getText(anaUrl(station.code, now), 20_000) ?? "", now) })));
    for (const item of settled) {
      if (item.status === "rejected") { failures++; continue; }
      const { station, reading } = item.value;
      if (reading) data[station.city] = { station: station.code, river: station.river, place: station.place, ...reading };
    }
  }
  return { data, failures };
}

async function fires(now: number) {
  const texts = await Promise.all(inpeUrls(now).map(url => getText(url, 45_000)));
  if (!texts.some(Boolean)) throw new Error("provider_unavailable");
  const { cells, count } = parseFires(texts.filter((text): text is string => typeof text === "string"), now);
  return { data: { cells, count }, count };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const admin = adminClient(15_000);
  try {
    const secrets = await pushSecrets(admin);
    if (!constantTimeEqual(req.headers.get("x-pluvia-cron-secret") || "", secrets.cron_secret)) return json(req, { error: "Não autorizado." }, 401);
    const body: any = await readJson(req);
    const kind = body?.action;
    if (kind !== "rivers" && kind !== "fires") return json(req, { error: "Ação inválida." }, 400);
    const now = Date.now();
    let data: unknown, summary: Record<string, unknown>;
    if (kind === "rivers") {
      const result = await rivers(now);
      if (result.failures) report("environment-refresh", "river_failures", { level: "warning", count: result.failures });
      // Nenhuma estação respondeu: mantém o resumo anterior (o RPC confere a idade de cada leitura).
      if (!Object.keys(result.data).length) return json(req, { ok: false, error: "provider_unavailable" }, 502);
      data = result.data;
      summary = { stations: Object.keys(result.data).length, failures: result.failures };
    } else {
      const result = await fires(now);
      data = result.data;
      summary = { spots: result.count };
    }
    const { error } = await admin.rpc("pluvia_environment_store", { p_kind: kind, p_data: data });
    if (error) { report("environment-refresh", "store_failed"); return json(req, { ok: false, error: "store_failed" }, 500); }
    return json(req, { ok: true, kind, ...summary });
  } catch (error) {
    report("environment-refresh", error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : "unexpected");
    return json(req, { ok: false, error: "unexpected" }, 500);
  }
});
