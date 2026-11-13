// Placar do radar (pedido do dono, 13/11/2026). Chamada só pelo cron de hora em hora (segredo do Vault no
// cabeçalho). Para as 27 capitais e a hora que acabou de fechar: lê em cada quadro de 10 min do RainViewer a
// mesma janela de 9 × 9 pixels que o app lê (_shared/radar-verify.js) e guarda quantos quadros viram a cidade
// molhada; guarda também se o aeroporto mais próximo relatou chuva na hora (METAR/SPECI, Aviation Weather
// Center). A comparação com a estação do INMET, o aeroporto e o "Tá chovendo aí?" fica na view
// private.radar_scores; nada vai para o app. A REDEMET entra aqui como outra fonte quando o DECEA autorizar.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Buffer } from "node:buffer";
import { PNG } from "npm:pngjs@7.0.0";
import { adminClient, pushSecrets } from "../_shared/supabase.ts";
import { json, preflight, readJson } from "../_shared/http.ts";
import { report } from "../_shared/error-report.js";
import { CAPITALS } from "../_shared/forecast-verify.js";
import { metarUrl, parseWeather } from "../_shared/metar.js";
import { cityPixel, windowShare, framesInHour, radarHour, airportHour, lastHourEnd } from "../_shared/radar-verify.js";

const USER_AGENT = "PLUVIA/1.0 (https://pluviaweather.com.br; https://github.com/luccamottaa/PLUVIA)";
const RAINVIEWER_HOST = /^https:\/\/[a-z0-9.-]+\.rainviewer\.com$/;

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left), b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}
async function fetchOk(url: string, accept: string, timeout: number) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: accept }, signal: AbortSignal.timeout(timeout) });
  if (!response.ok) throw new Error("provider_unavailable");
  return response;
}

// RainViewer: telhas compartilhadas na rodada (capitais vizinhas caem na mesma telha), 6 cidades por vez.
async function rainviewer(hourEnd: number) {
  const meta: any = await (await fetchOk("https://api.rainviewer.com/public/weather-maps.json", "application/json", 10_000)).json();
  const host = typeof meta?.host === "string" && RAINVIEWER_HOST.test(meta.host) ? meta.host : null;
  const frames = host ? framesInHour(meta?.radar?.past, hourEnd) : [];
  const tiles = new Map<string, Promise<Uint8Array | null>>();
  const tile = (url: string) => {
    if (!tiles.has(url)) tiles.set(url, fetchOk(url, "image/png", 10_000).then(async response => {
      const png = PNG.sync.read(Buffer.from(await response.arrayBuffer()));
      return png.width === 256 && png.height === 256 ? new Uint8Array(png.data) : null;
    }).catch(() => null));
    return tiles.get(url)!;
  };
  const rows: unknown[] = [];
  let failures = 0;
  for (let start = 0; start < CAPITALS.length; start += 6) {
    await Promise.all(CAPITALS.slice(start, start + 6).map(async ({ id, lat, lon }: any) => {
      const { tileX, tileY, px, py } = cityPixel(lon, lat);
      const shares = await Promise.all(frames.map(async (frame: any) => {
        const rgba = await tile(`${host}${frame.path}/256/7/${tileX}/${tileY}/2/1_1.png`);
        if (!rgba) { failures++; return null; }
        return windowShare(rgba, px, py);
      }));
      const row = radarHour(id, "rainviewer", hourEnd, shares);
      if (row) rows.push(row);
    }));
  }
  return { rows, frames: frames.length, failures };
}

// Aeroportos: uma consulta por capital (caixa pequena, como em station-now), 6 por vez.
async function airports(hourEnd: number) {
  const rows: unknown[] = [];
  let failures = 0;
  for (let start = 0; start < CAPITALS.length; start += 6) {
    await Promise.all(CAPITALS.slice(start, start + 6).map(async ({ id, lat, lon }: any) => {
      try {
        const list = await (await fetchOk(metarUrl(lat, lon, 2), "application/json", 10_000)).json();
        const row = airportHour(list, id, lat, lon, hourEnd, parseWeather);
        if (row) rows.push(row);
      } catch { failures++; }
    }));
  }
  return { rows, failures };
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
    const hourEnd = lastHourEnd(Date.now());
    const [radar, airport] = await Promise.allSettled([rainviewer(hourEnd), airports(hourEnd)]);
    const radarRows = radar.status === "fulfilled" ? radar.value.rows : [];
    const airportRows = airport.status === "fulfilled" ? airport.value.rows : [];
    if (radar.status === "rejected") report("radar-verify", "rainviewer_unavailable", { level: "warning" });
    else if (radar.value.failures > 0) report("radar-verify", "tile_failures", { level: "warning", count: radar.value.failures });
    if (airport.status === "fulfilled" && airport.value.failures > 0) report("radar-verify", "metar_failures", { level: "warning", count: airport.value.failures });
    const { data, error } = await admin.rpc("pluvia_radar_store", { p_radar: radarRows, p_airports: airportRows });
    if (error) { report("radar-verify", "store_failed"); return json(req, { ok: false, error: "store_failed" }, 500); }
    return json(req, { ok: true, stored: data, frames: radar.status === "fulfilled" ? radar.value.frames : 0 });
  } catch (error) {
    report("radar-verify", error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : "unexpected");
    return json(req, { ok: false, error: "unexpected" }, 500);
  }
});
