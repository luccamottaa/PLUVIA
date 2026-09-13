import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, authenticatedUser } from "../_shared/supabase.ts";
import { json, preflight, readJson } from "../_shared/http.ts";

type WeatherContext = {
  schemaVersion: number;
  city: { id: string; name: string; timezone: string };
  observedAt: string;
  current: Record<string, number | null>;
  next3h: { probability: number; precipitation: number; gust: number; codes: number[] };
  next6h: { probability: number; precipitation: number; gust: number; codes: number[] };
  uv: number;
  airQuality: number | null;
};

const evidenceKeys = new Set([
  "current.code", "current.temperature", "current.apparent", "current.humidity", "current.precipitation", "current.gust",
  "next3h.probability", "next3h.precipitation", "next3h.gust", "next3h.codes",
  "next6h.probability", "next6h.precipitation", "next6h.gust", "next6h.codes", "uv", "airQuality",
]);
const statuses = new Set(["calm", "info", "warning", "danger"]);
const tones = new Set(["calm", "info", "warning", "danger"]);
const finite = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null;
const bounded = (value: unknown, min: number, max: number) => {
  const number = finite(value);
  if (number === null || number < min || number > max) throw new Error("invalid_context");
  return number;
};

function cleanContext(raw: any): WeatherContext {
  const cityId = String(raw?.city?.id || "");
  const cityName = String(raw?.city?.name || "").trim().slice(0, 100);
  const timezone = String(raw?.city?.timezone || "").trim().slice(0, 64);
  if (raw?.schemaVersion !== 1 || !/^\d{7}$/.test(cityId) || !cityName || !raw?.observedAt || raw.observedAt.length > 40) throw new Error("invalid_context");
  try { new Intl.DateTimeFormat("pt-BR", { timeZone: timezone }).format(); } catch { throw new Error("invalid_context"); }
  const cleanCodes = (values: unknown) => {
    if (!Array.isArray(values) || values.length > 6) throw new Error("invalid_context");
    return values.map(value => bounded(value, 0, 99));
  };
  const current = raw.current || {};
  return {
    schemaVersion: 1,
    city: { id: cityId, name: cityName, timezone },
    observedAt: String(raw.observedAt),
    current: {
      code: bounded(current.code ?? 0, 0, 99), temperature: bounded(current.temperature, -80, 70),
      apparent: bounded(current.apparent, -100, 90), humidity: bounded(current.humidity, 0, 100),
      precipitation: bounded(current.precipitation ?? 0, 0, 500), gust: bounded(current.gust ?? 0, 0, 400),
    },
    next3h: {
      probability: bounded(raw.next3h?.probability ?? 0, 0, 100), precipitation: bounded(raw.next3h?.precipitation ?? 0, 0, 500),
      gust: bounded(raw.next3h?.gust ?? 0, 0, 400), codes: cleanCodes(raw.next3h?.codes),
    },
    next6h: {
      probability: bounded(raw.next6h?.probability ?? 0, 0, 100), precipitation: bounded(raw.next6h?.precipitation ?? 0, 0, 1000),
      gust: bounded(raw.next6h?.gust ?? 0, 0, 400), codes: cleanCodes(raw.next6h?.codes),
    },
    uv: bounded(raw.uv ?? 0, 0, 30),
    airQuality: raw.airQuality === null || raw.airQuality === undefined ? null : bounded(raw.airQuality, 0, 500),
  };
}

function clientHash(context: WeatherContext) {
  const round = (value: number | null, digits = 0) => value === null ? null : Number(value.toFixed(digits));
  const stable = JSON.stringify({
    city: context.city.id, period: context.observedAt.slice(0, 13), code: context.current.code,
    temperature: round(context.current.temperature), apparent: round(context.current.apparent), humidity: round(context.current.humidity),
    p3: round(context.next3h.probability), mm3: round(context.next3h.precipitation, 1), mm6: round(context.next6h.precipitation, 1),
    gust: round(context.next3h.gust), uv: round(context.uv), aqi: round(context.airQuality),
  });
  let hash = 2166136261;
  for (let index = 0; index < stable.length; index += 1) hash = Math.imul(hash ^ stable.charCodeAt(index), 16777619);
  return `v1-${(hash >>> 0).toString(36)}`;
}

async function serverHash(context: WeatherContext) {
  const bytes = new TextEncoder().encode(JSON.stringify(context));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

function allowedNumbers(context: WeatherContext) {
  const values = [3, 6, ...Object.values(context.current), context.next3h.probability, context.next3h.precipitation, context.next3h.gust,
    ...context.next3h.codes, context.next6h.probability, context.next6h.precipitation, context.next6h.gust, ...context.next6h.codes,
    context.uv, context.airQuality].filter(value => typeof value === "number") as number[];
  return new Set(values.flatMap(value => [String(value), String(Math.round(value)), value.toFixed(1).replace(".", ",")]));
}

function validSummary(raw: any, context: WeatherContext) {
  if (!raw || !statuses.has(raw.status) || typeof raw.title !== "string" || !raw.title.trim() || raw.title.length > 90) return false;
  if (typeof raw.summary !== "string" || !raw.summary.trim() || raw.summary.length > 360 || !Array.isArray(raw.highlights) || raw.highlights.length > 4) return false;
  if (!Number.isInteger(raw.iconCode) || raw.iconCode < 0 || raw.iconCode > 99 || !Array.isArray(raw.evidence) || !raw.evidence.every((key: unknown) => evidenceKeys.has(String(key)))) return false;
  if (!raw.highlights.every((item: any) => item && typeof item.label === "string" && item.label.length <= 80 && tones.has(item.tone) && evidenceKeys.has(item.evidence))) return false;
  const copy = [raw.title, raw.summary, ...raw.highlights.map((item: any) => item.label)].join(" ");
  const permitted = allowedNumbers(context);
  return [...copy.matchAll(/\d+(?:[.,]\d+)?/g)].every(match => permitted.has(match[0]));
}

function schema() {
  return {
    type: "object", additionalProperties: false,
    required: ["status", "title", "summary", "highlights", "iconCode", "evidence"],
    properties: {
      status: { type: "string", enum: [...statuses] }, title: { type: "string", maxLength: 90 }, summary: { type: "string", maxLength: 360 },
      highlights: { type: "array", maxItems: 4, items: { type: "object", additionalProperties: false, required: ["label", "tone", "evidence"], properties: {
        label: { type: "string", maxLength: 80 }, tone: { type: "string", enum: [...tones] }, evidence: { type: "string", enum: [...evidenceKeys] },
      } } },
      iconCode: { type: "integer", minimum: 0, maximum: 99 }, evidence: { type: "array", items: { type: "string", enum: [...evidenceKeys] }, maxItems: 8 },
    },
  };
}

async function generate(context: WeatherContext, apiKey: string, model: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", signal: AbortSignal.timeout(8_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, store: false, max_output_tokens: 450,
      instructions: "Você é o editor meteorológico do PLUVIA. Interprete somente o JSON fornecido. Não faça previsão nova, não cite radar, satélite ou alerta oficial, não invente número, horário ou evento. Escreva em português brasileiro, de forma curta, prática e sem alarmismo. Cada afirmação deve listar a chave de evidência correspondente.",
      input: JSON.stringify(context),
      text: { format: { type: "json_schema", name: "pluvia_smart_summary", strict: true, schema: schema() } },
    }),
  });
  if (!response.ok) throw new Error(`provider_${response.status}`);
  const payload: any = await response.json();
  const text = payload.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text;
  if (!text) throw new Error("provider_empty");
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const user = await authenticatedUser(req);
  if (!user) return json(req, { error: "Entre na sua conta para receber a interpretação aprimorada." }, 401);

  try {
    const context = cleanContext((await readJson(req) as any)?.context);
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    if (!apiKey) return json(req, { available: false, reason: "provider_not_configured" });
    const admin = adminClient();
    const hash = await serverHash(context);
    const { data: cached } = await admin.from("smart_summary_cache").select("summary,generated_at").eq("context_hash", hash).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (cached?.summary && validSummary(cached.summary, context)) return json(req, { available: true, cached: true, summary: { ...cached.summary, contextHash: clientHash(context), generatedAt: cached.generated_at, source: "ai" } });

    const { data: allowed, error: quotaError } = await admin.rpc("pluvia_take_summary_quota", { p_user_id: user.id, p_limit: 12 });
    if (quotaError || !allowed) return json(req, { available: false, reason: "rate_limited" }, 429);
    const generated = await generate(context, apiKey, model);
    if (!validSummary(generated, context)) throw new Error("invalid_generated_summary");
    const generatedAt = new Date();
    const summary = { ...generated, contextHash: clientHash(context), generatedAt: generatedAt.toISOString(), source: "ai" };
    await admin.from("smart_summary_cache").upsert({
      context_hash: hash, city_id: context.city.id, summary: generated, provider: "openai", model,
      generated_at: generatedAt.toISOString(), expires_at: new Date(generatedAt.getTime() + 20 * 60_000).toISOString(),
    });
    return json(req, { available: true, cached: false, summary });
  } catch (error) {
    console.error("smart-summary failed", { code: error instanceof Error ? error.message : "unknown" });
    return json(req, { available: false, reason: "generation_failed" });
  }
});
