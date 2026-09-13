// web-push implements RFC 8291 payload encryption and VAPID signing.
import webpush from "npm:web-push@3.6.7";

export type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type VapidConfig = {
  vapid_public_key: string;
  vapid_private_key: string;
  vapid_subject: string;
};

export async function sendWebPush(subscription: StoredSubscription, payload: Record<string, unknown>, vapid: VapidConfig, severity = 2) {
  const topicSource = String(payload.tag || payload.type || "pluvia");
  const topic = topicSource.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32) || "pluvia";
  return await webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    JSON.stringify(payload),
    {
      vapidDetails: { subject: vapid.vapid_subject, publicKey: vapid.vapid_public_key, privateKey: vapid.vapid_private_key },
      TTL: severity >= 4 ? 43_200 : 10_800,
      urgency: severity >= 3 ? "high" : "normal",
      topic,
      timeout: 12_000,
    },
  );
}

export function pushErrorCode(error: unknown) {
  const status = Number((error as { statusCode?: number })?.statusCode || 0);
  if (status === 404 || status === 410) return { code: `subscription_${status}`, invalid: true };
  if (status === 429) return { code: "push_rate_limited", invalid: false };
  if (status >= 500) return { code: "push_service_unavailable", invalid: false };
  return { code: status ? `push_http_${status}` : "push_transport_failed", invalid: false };
}

