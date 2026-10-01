const PRODUCTION_ORIGIN = "https://pluviaweather.com.br";

export function allowedOrigin(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (origin === PRODUCTION_ORIGIN || origin === "https://luccamottaa.github.io" || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return PRODUCTION_ORIGIN;
}

export function corsHeaders(req: Request) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(req),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function preflight(req: Request) {
  const origin = req.headers.get("origin") || "";
  if (origin && allowedOrigin(req) !== origin) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export async function readJson(req: Request) {
  const size = Number(req.headers.get("content-length") || 0);
  if (size > 24_000) throw new Error("payload_too_large");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("empty_payload");
  const decoder = new TextDecoder();
  let bytes = 0, body = "";
  try {
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 24_000) { await reader.cancel(); throw new Error("payload_too_large"); }
      body += decoder.decode(value,{stream:true});
    }
    return JSON.parse(body + decoder.decode());
  } finally { reader.releaseLock(); }
}
