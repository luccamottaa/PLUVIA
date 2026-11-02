// Worker do PLUVIA no Cloudflare: entrega a pasta dist/ (binding ASSETS) e só acerta os cabeçalhos.
// Com o site atrás de um Worker, as Cache Rules da zona (docs/CLOUDFLARE.md) não valem mais para os arquivos:
// sem isto, JS/CSS com ?v= saíam com max-age=0 e o navegador revalidava tudo na primeira visita.
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
  "X-Frame-Options": "SAMEORIGIN"
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // www → domínio sem www (antes o GitHub Pages fazia isso): o Google não vê duas cópias do site.
    if (url.hostname === `www.${HOST}`) {
      url.hostname = HOST;
      return Response.redirect(url.toString(), 301);
    }
    return withHeaders(await env.ASSETS.fetch(request), url);
  }
};
