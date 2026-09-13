import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, authenticatedUser, pushSecrets } from "../_shared/supabase.ts";
import { json, preflight, readJson } from "../_shared/http.ts";
import { pushErrorCode, sendWebPush } from "../_shared/webpush.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const user = await authenticatedUser(req);
  if (!user) return json(req, { error: "Entre na sua conta para testar notificações." }, 401);
  const admin = adminClient();

  try {
    const body: any = await readJson(req);
    if (body?.action !== "test" || !/^[0-9a-f-]{36}$/i.test(String(body?.subscriptionId || ""))) return json(req, { error: "Teste inválido." }, 400);
    const { data: subscription, error } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("id", body.subscriptionId).eq("user_id", user.id).eq("enabled", true).maybeSingle();
    if (error || !subscription) return json(req, { error: "Este dispositivo não está ativo." }, 404);
    const now = new Date(), expires = new Date(now.getTime() + 15 * 60_000);
    const { data: event, error: eventError } = await admin.from("notification_events").insert({
      event_type: "test", city_id: "test", city_name: "PLUVIA", uf: "BR", severity: 1,
      fingerprint: `test:${crypto.randomUUID()}`, started_at: now.toISOString(), expires_at: expires.toISOString(),
      source: "PLUVIA Web Push", title: "🔔 PLUVIA", body: "Notificação de teste recebida. Seus alertas estão funcionando neste dispositivo.", target_url: "./#alertas",
    }).select("id").single();
    if (eventError) throw eventError;
    const { data: delivery, error: deliveryError } = await admin.from("notification_deliveries").insert({ event_id: event.id, user_id: user.id, subscription_id: subscription.id }).select("id").single();
    if (deliveryError) throw deliveryError;

    try {
      const vapid = await pushSecrets(admin);
      const result = await sendWebPush(subscription, {
        title: "🔔 PLUVIA", body: "Notificação de teste recebida. Seus alertas estão funcionando neste dispositivo.",
        icon: "/icon-192.png", badge: "/logo-mark.png", tag: "pluvia-test", type: "test",
        url: `./?push_delivery=${delivery.id}#alertas`, deliveryId: delivery.id,
      }, vapid, 1);
      await admin.from("notification_deliveries").update({ status: "accepted", sent_at: new Date().toISOString() }).eq("id", delivery.id);
      return json(req, { ok: true, accepted: true, statusCode: result.statusCode });
    } catch (pushError) {
      const failure = pushErrorCode(pushError);
      await admin.from("notification_deliveries").update({ status: failure.invalid ? "expired" : "failed", error_code: failure.code }).eq("id", delivery.id);
      if (failure.invalid) await admin.from("push_subscriptions").update({ enabled: false }).eq("id", subscription.id);
      return json(req, { error: failure.invalid ? "A inscrição deste dispositivo expirou. Ative os alertas novamente." : "O serviço push não aceitou o envio agora." }, failure.invalid ? 410 : 503);
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "test_failed";
    console.error("push-send failed", { code });
    return json(req, { error: "Não foi possível concluir o teste agora." }, 503);
  }
});

