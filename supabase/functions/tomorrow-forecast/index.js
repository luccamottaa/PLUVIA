// Modo de teste "Testar Tomorrow.io" (pedido do dono, novembro/2026). Só quem liga o teste em Mais do PLUVIA
// chama esta função; a chave fica no servidor (secret TOMORROW_API_KEY) e nunca vai para o navegador.
//
// Plano grátis do Tomorrow.io: 25 consultas por hora e 500 por dia, dividida com os avisos (push-process) e
// o placar (forecast-verify). Freios por instância: cache de 30 min por coordenada arredondada, no máximo
// HOURLY_CAP consultas ao provedor por hora, 20 pedidos por IP em 10 min e, depois de um 429 do provedor,
// 30 min sem tentar. Sem cota, responde 429 com `retryAfter`: o app volta ao Open-Meteo e tenta de novo
// depois. A URL do provedor leva a chave: nunca registrar a URL nem a resposta bruta.
import { tomorrowUrl } from '../_shared/tomorrow.js';
import { TEST_HOURS, requestPlan, nextRefusal, normalizeTomorrow } from '../_shared/tomorrow-forecast.js';

const SITE = 'https://pluviaweather.com.br';
const ORIGINS = new Set([SITE, 'https://www.pluviaweather.com.br', 'https://luccamottaa.github.io']);
const CACHE_MS = 30 * 60_000, COOLDOWN_MS = 30 * 60_000, HOURLY_CAP = 12;
const cache = new Map(), attempts = new Map();
let blockedUntil = 0, windowStart = 0, used = 0;
const refusedLevels = new Set();

function originAllowed(origin) {
  return !origin || ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
function headers(origin, ttl = 0) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin || SITE,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': ttl ? `private, max-age=${ttl}` : 'no-store',
    'Vary': 'Origin',
  };
}
const reply = (origin, status, body, ttl = 0) => new Response(JSON.stringify(body), { status, headers: headers(origin, ttl) });
function coordinate(value, min, max) {
  if (value === null || !/^-?\d{1,3}(?:\.\d{1,4})?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}
const limited = (origin, now, until) => reply(origin, 429, { error: 'rate_limited', retryAfter: Math.max(60, Math.ceil((until - now) / 1000)) });

async function handle(req) {
  const origin = req.headers.get('origin') || '';
  if (!originAllowed(origin)) return reply(SITE, 403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
  if (req.method !== 'GET') return reply(origin, 405, { error: 'method_not_allowed' });
  const key = Deno.env.get('TOMORROW_API_KEY') ?? '';
  if (!key) return reply(origin, 503, { error: 'not_configured' });
  const url = new URL(req.url);
  const lat = coordinate(url.searchParams.get('lat'), -34, 6), lon = coordinate(url.searchParams.get('lon'), -74, -32);
  if (lat === null || lon === null) return reply(origin, 400, { error: 'invalid_location' });
  const now = Date.now(), id = `${(Math.round(lat * 50) / 50).toFixed(2)},${(Math.round(lon * 50) / 50).toFixed(2)}`;
  const stored = cache.get(id);
  if (stored && now - stored.at < CACHE_MS) return reply(origin, 200, stored.data, Math.max(60, Math.floor((CACHE_MS - (now - stored.at)) / 1000)));
  const ip = req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || 'shared';
  const record = attempts.get(ip), current = record && record.until > now ? record : { count: 0, until: now + 600_000 };
  current.count += 1; attempts.set(ip, current);
  if (current.count > 20) return limited(origin, now, current.until);
  if (now < blockedUntil) return limited(origin, now, blockedUntil);
  if (now - windowStart >= 3600_000) { windowStart = now; used = 0; }
  if (used >= HOURLY_CAP) return limited(origin, now, windowStart + 3600_000);
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  if (attempts.size > 500) attempts.delete(attempts.keys().next().value);
  used++;
  try {
    // Níveis opcionais (requestPlan): ar, trovoada, minuto a minuto, horas passadas e extras. Campo ou parâmetro fora
    // do plano costuma voltar 400 ou 403; cada recusa tira o próximo nível (nextRefusal) e vale para a instância
    // inteira, para não repetir a tentativa a cada pedido.
    const refused = status => status === 400 || status === 403;
    const ask = () => {
      const plan = requestPlan(refusedLevels);
      const provider = new URL(tomorrowUrl(lat, lon, key, now, plan.fields, TEST_HOURS, plan.pastHours));
      provider.searchParams.set('timesteps', plan.timesteps);
      return fetch(provider, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    };
    let response = await ask();
    for (let level = nextRefusal(refusedLevels); refused(response.status) && level; level = nextRefusal(refusedLevels)) {
      refusedLevels.add(level); used++;
      console.warn('tomorrow-forecast level refused', { level, status: response.status });
      response = await ask();
    }
    if (response.status === 429) { blockedUntil = now + COOLDOWN_MS; return limited(origin, now, blockedUntil); }
    if (!response.ok) { console.warn('tomorrow-forecast unavailable', { status: response.status }); return reply(origin, 502, { error: 'provider_unavailable' }); }
    const data = normalizeTomorrow(await response.json(), now);
    if (!data) return reply(origin, 502, { error: 'invalid_provider_data' });
    cache.set(id, { at: now, data });
    return reply(origin, 200, data, Math.floor(CACHE_MS / 1000));
  } catch {
    return reply(origin, 502, { error: 'provider_unavailable' });
  }
}

Deno.serve(handle);
