// Worker do PLUVIA no Cloudflare: entrega a pasta dist/ (binding ASSETS) e só acerta os cabeçalhos.
// Com o site atrás de um Worker, as Cache Rules da zona (docs/CLOUDFLARE.md) não valem mais para os arquivos:
// sem isto, JS/CSS com ?v= saíam com max-age=0 e o navegador revalidava tudo na primeira visita.
import "../dist/vendor/suncalc.js"; // registra globalThis.PLUVIA.sun (getTimes), o mesmo do app
import sunTable from "../dist/modules/sun-table.js";
import cityTime from "../dist/modules/city-time.js";
import CITY_PAGES from "./city-pages.mjs";

const HOST = "pluviaweather.com.br";
const YEAR = "public, max-age=31536000, immutable";
// As mesmas pré-conexões do <head>: com Early Hints ligado na zona, o Cloudflare manda isto num 103
// antes do HTML, e o navegador já abre as conexões das consultas da abertura.
const PRECONNECT = [
  "<https://api.open-meteo.com>; rel=preconnect; crossorigin",
  "<https://air-quality-api.open-meteo.com>; rel=preconnect; crossorigin",
  "<https://dszyyrcvwrpyiypwyvxe.supabase.co>; rel=preconnect; crossorigin"
].join(", ");
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000",
  // Localização e microfone (busca por voz) só na própria página; nada de câmera.
  "Permissions-Policy": "geolocation=(self), microphone=(self), camera=()",
  "X-Frame-Options": "SAMEORIGIN",
  // CSP incremental: bloqueia plugins, alteração de base URL e framing externo sem limitar os scripts/APIs atuais.
  "Content-Security-Policy": "object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
};

// A URL muda quando o conteúdo muda (a regra do ?v= no AGENTS.md), então guardar um ano é seguro.
// As fontes têm a versão no nome do arquivo.
export function longLived(url) {
  return url.searchParams.has("v") || url.pathname.startsWith("/assets/fonts/");
}

export function withHeaders(response, url) {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY)) out.headers.set(name, value);
  const ok = response.status === 200 || response.status === 304;
  if (url.pathname === "/sw.js") out.headers.set("Cache-Control", "no-cache");
  else if (ok && longLived(url)) out.headers.set("Cache-Control", YEAR);
  if (response.status === 200 && (out.headers.get("Content-Type") || "").startsWith("text/html")) out.headers.set("Link", PRECONNECT);
  return out;
}

// Pôr do sol de hoje no Google (novembro/2026, pedido do dono): em /clima/<cidade>/ o <title> e a meta description
// ganham o nascer e o pôr do sol do dia no fuso da cidade, com o mesmo cálculo da tabela do app (SunCalc +
// sun-table.js + city-time.js). O HTML estático em dist/ não muda; o Worker reescreve na saída.
const CITY_PATH = /^\/clima\/([a-z0-9-]+)\/(?:index\.html)?$/;
const clockFormats = new Map();
function clock(at, timezone) {
  if (!clockFormats.has(timezone)) clockFormats.set(timezone, new Intl.DateTimeFormat("pt-BR", {timeZone:timezone, hour:"2-digit", minute:"2-digit", hourCycle:"h23"}));
  return clockFormats.get(timezone).format(new Date(at));
}
// Textos do dia para a cidade do slug, ou null (slug desconhecido ou dia sem nascer/pôr do sol).
export function sunTexts(slug, at = Date.now()) {
  const entry = CITY_PAGES[slug];
  if (!entry) return null;
  const [name, uf, lat, lon, timezone] = entry, city = {name, uf, lat, lon, timezone};
  const [today] = sunTable.rows({city, at, days:1, sun:globalThis.PLUVIA?.sun, time:cityTime});
  if (!today || !Number.isFinite(today.rise) || !Number.isFinite(today.set)) return null;
  const rise = clock(today.rise, timezone), set = clock(today.set, timezone);
  return {
    day:today.date,
    title:`Pôr do sol hoje em ${name}: ${set} · Clima e previsão — PLUVIA`,
    description:`Pôr do sol hoje em ${name} (${uf}) às ${set} e nascer do sol às ${rise}. Clima agora, chuva hora a hora, previsão de 7 dias, radar e avisos do INMET.`,
  };
}

async function cityPage(request, env, url, slug) {
  const texts = sunTexts(slug);
  if (!texts) return withHeaders(await env.ASSETS.fetch(request), url);
  // O corpo muda todo dia: o pedido aos arquivos vai sem condicional e a validação usa uma etiqueta do dia
  // (a etiqueta do arquivo + a data municipal). Assim um 304 nunca devolve o título de ontem.
  const headers = new Headers(request.headers);
  headers.delete("If-None-Match"); headers.delete("If-Modified-Since");
  const response = await env.ASSETS.fetch(new Request(request, {headers}));
  if (response.status !== 200 || !(response.headers.get("Content-Type") || "").startsWith("text/html")) return withHeaders(response, url);
  const base = (response.headers.get("ETag") || "").replace(/^W\//, "").replace(/"/g, "");
  const tag = `W/"${base}-${texts.day}"`;
  if ((request.headers.get("If-None-Match") || "").split(",").map(value => value.trim()).includes(tag)) {
    const out = withHeaders(new Response(null, {status:304, headers:response.headers}), url);
    out.headers.set("ETag", tag);
    return out;
  }
  const rewritten = new HTMLRewriter()
    .on("title", {element(element) { element.setInnerContent(texts.title); }})
    .on('meta[name="description"]', {element(element) { element.setAttribute("content", texts.description); }})
    .transform(response);
  const out = withHeaders(rewritten, url);
  out.headers.set("ETag", tag);
  out.headers.delete("Last-Modified");
  out.headers.delete("Content-Length");
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // www → domínio sem www (antes o GitHub Pages fazia isso): o Google não vê duas cópias do site.
    if (url.hostname === `www.${HOST}`) {
      url.hostname = HOST;
      return Response.redirect(url.toString(), 301);
    }
    const city = (request.method === "GET" || request.method === "HEAD") && CITY_PATH.exec(url.pathname);
    if (city && typeof HTMLRewriter === "function") return cityPage(request, env, url, city[1]);
    return withHeaders(await env.ASSETS.fetch(request), url);
  }
};
