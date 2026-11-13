// Mapa de chuva do Tomorrow.io no radar (pedido do dono, novembro/2026: "pode colocar", depois de um teste em
// que o plano grátis aceitou as telhas e elas mostraram pancadas em Manaus que o RainViewer não via). A chave
// fica aqui: o navegador pede ?z&x&y&t e recebe o PNG de 256 px de precipitationIntensity. Só o Brasil (com
// folga), zoom 3 a 7 (o mapa amplia além disso, como faz com o RainViewer) e horas cheias de 2 h atrás a 6 h à
// frente. Freios por instância: cache de 30 min por telha, teto de consultas ao provedor por hora, pedidos por
// IP e pausa depois de um 429. A URL do provedor leva a chave: nunca vai para log nem para a resposta.
import { tileAllowed, tileTime, tileKey } from '../_shared/tomorrow-tiles.js';

const SITE = 'https://pluviaweather.com.br';
const ORIGINS = new Set([SITE, 'https://www.pluviaweather.com.br', 'https://luccamottaa.github.io']);
const CACHE_MS = 30 * 60_000, COOLDOWN_MS = 10 * 60_000, HOURLY_CAP = 400, MAX_CACHE = 800, IP_LIMIT = 400;
const cache = new Map(), attempts = new Map();
let blockedUntil = 0, windowStart = 0, used = 0;

const originAllowed = origin => !origin || ORIGINS.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
const cors = origin => ({ 'Access-Control-Allow-Origin': origin && originAllowed(origin) ? origin : SITE, 'Access-Control-Allow-Methods': 'GET, OPTIONS', Vary: 'Origin' });
const fail = (origin, status, error) => new Response(JSON.stringify({ error }), { status, headers: { ...cors(origin), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const png = (origin, bytes, ttl) => new Response(bytes, { status: 200, headers: { ...cors(origin), 'Content-Type': 'image/png', 'Cache-Control': `public, max-age=${ttl}` } });

async function handle(req) {
  const origin = req.headers.get('origin') || '';
  if (!originAllowed(origin)) return fail(SITE, 403, 'origin_not_allowed');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'GET') return fail(origin, 405, 'method_not_allowed');
  const key = Deno.env.get('TOMORROW_API_KEY') ?? '';
  if (!key) return fail(origin, 503, 'not_configured');
  const url = new URL(req.url), now = Date.now();
  const z = Number(url.searchParams.get('z')), x = Number(url.searchParams.get('x')), y = Number(url.searchParams.get('y'));
  const t = tileTime(url.searchParams.get('t'), now);
  if (!tileAllowed(z, x, y) || t === null) return fail(origin, 400, 'invalid_tile');
  const id = tileKey(z, x, y, t), stored = cache.get(id);
  if (stored && now - stored.at < CACHE_MS) return png(origin, stored.bytes, Math.max(60, Math.floor((CACHE_MS - (now - stored.at)) / 1000)));
  // Pedidos por IP (10 min): um mapa aberto pede ~12 telhas por hora mostrada.
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const seen = attempts.get(ip);
  const current = seen && now < seen.until ? { count: seen.count + 1, until: seen.until } : { count: 1, until: now + 10 * 60_000 };
  attempts.set(ip, current);
  if (attempts.size > 5000) attempts.clear();
  if (current.count > IP_LIMIT || now < blockedUntil) return fail(origin, 429, 'rate_limited');
  if (now - windowStart >= 3600_000) { windowStart = now; used = 0; }
  if (used >= HOURLY_CAP) return fail(origin, 429, 'rate_limited');
  used++;
  try {
    const response = await fetch(`https://api.tomorrow.io/v4/map/tile/${z}/${x}/${y}/precipitationIntensity/${new Date(t * 1000).toISOString()}.png?apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10_000) });
    if (response.status === 429) { blockedUntil = now + COOLDOWN_MS; console.warn('tomorrow-tiles rate limited', { status: 429 }); return fail(origin, 429, 'rate_limited'); }
    if (!response.ok || !(response.headers.get('content-type') || '').startsWith('image/png')) {
      console.warn('tomorrow-tiles unavailable', { status: response.status });
      return fail(origin, 502, 'provider_unavailable');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(id, { at: now, bytes });
    return png(origin, bytes, Math.floor(CACHE_MS / 1000));
  } catch {
    return fail(origin, 504, 'provider_timeout');
  }
}

Deno.serve(handle);
