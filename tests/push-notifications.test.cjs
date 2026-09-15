const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('dist/index.html');
const client = read('dist/notifications.js');
const worker = read('dist/sw.js');
const migration = read('supabase/migrations/20260913134000_push_notifications.sql');
const subscriptions = read('supabase/functions/push-subscriptions/index.ts');
const sender = read('supabase/functions/push-send/index.ts');
const processor = read('supabase/functions/push-process/index.ts');

assert.match(html, /id="notificationPrompt"[\s\S]+id="notificationPromptButton"/);
assert.match(html, /id="installPushDialog"/);
assert.match(html, /id="notificationContinueNote"/);
assert.match(html, /id="notificationPreferencesForm"/);
assert.match(html, /id="notificationTest"/);
assert.match(html, /id="notificationLocations"[\s\S]+id="notificationDevices"/);
assert.match(html, /id="notificationDiagnostics"/);
assert.match(html, /name="weather_changes"(?! disabled)/);
assert.match(client, /promptButton\.addEventListener\("click", enable\)/, 'permissão precisa partir de gesto explícito');
assert.match(client, /Notification\.requestPermission\(\)/);
assert.doesNotMatch(client, /new Notification\s*\(/, 'teste local não pode substituir Web Push real');
assert.match(client, /push-send[\s\S]+action: "test"/);
assert.match(client, /display-mode: standalone/);
assert.match(client, /adicione o PLUVIA à Tela de Início/i);
assert.match(client, /setPendingEnable\(true\)/);
assert.match(client, /saveAlertSetup/);
assert.match(client, /Conexão segura[\s\S]+Service Worker[\s\S]+Web Push/);

assert.match(worker, /addEventListener\("push"/);
assert.match(worker, /showNotification/);
assert.match(worker, /addEventListener\("notificationclick"/);
assert.match(worker, /clients\.openWindow/);
assert.match(worker, /pushsubscriptionchange/);

for (const table of ['push_subscriptions', 'notification_preferences', 'notification_locations', 'notification_events', 'notification_deliveries']) {
  assert.match(migration, new RegExp(`create table public\\.${table}`));
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
}
assert.match(migration, /unique \(event_id, subscription_id\)/);
assert.match(migration, /fingerprint text not null unique/);
assert.match(migration, /vault\.decrypted_secrets/);
assert.match(migration, /cron\.schedule/);
assert.doesNotMatch(migration, /vapid_private_key\s*=\s*['"][A-Za-z0-9_-]+/, 'chave privada não pode estar versionada');

assert.match(subscriptions, /authenticatedUser\(req\)/);
assert.match(subscriptions, /action === "remove_location"/);
assert.match(sender, /sendWebPush/);
assert.match(sender, /subscriptionId/);
assert.match(processor, /error\?\.code === "23505"[\s\S]+notification_events/,
  'evento compartilhado precisa continuar sendo entregue a usuários diferentes');
assert.match(processor, /event\.type !== "daily_summary"/);
assert.match(processor, /air-quality-api\.open-meteo\.com/);
assert.match(processor, /INMET · alerta oficial/);
assert.match(processor, /severityLabel[\s\S]+válido até[\s\S]+Fonte: INMET/);
assert.match(processor, /type: "weather_change"[\s\S]+temperature_delta_c[\s\S]+rain_transition[\s\S]+wind_transition/);
assert.match(processor, /inQuietHours/);
assert.match(processor, /push_subscriptions[\s\S]+enabled: false/);
assert.match(processor, /diagnostic_code/, 'worker privado precisa expor código seguro ao cron para observabilidade');

console.log('PASS push: opt-in contextual, backend real, RLS, deduplicação, cron, service worker e dispositivos.');
