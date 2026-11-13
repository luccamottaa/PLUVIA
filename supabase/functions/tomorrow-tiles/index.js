// Mapa de chuva do Tomorrow.io no radar: DESLIGADO (1.73.10, pedido do dono: "tira o mapa"). Na noite de 12/11 as
// telhas mostraram que entram na mesma cota grátis de 25 consultas por hora dos avisos e do placar: depois de 32
// telhas o Tomorrow.io passou a recusar tudo (429). Uma abertura do radar pedia ~30 telhas. A função fica publicada
// só para responder 410 sem tocar no Tomorrow.io (nenhuma cota gasta) a quem ainda tiver o app antigo em cache.
// O código anterior está no histórico do git (PR #402).
const SITE = 'https://pluviaweather.com.br';

Deno.serve(req => {
  const origin = req.headers.get('origin') || SITE;
  const headers = { 'Access-Control-Allow-Origin': origin, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  return new Response(JSON.stringify({ error: 'disabled' }), { status: 410, headers });
});
