-- PLUVIA Web Push foundation: subscriptions, preferences, monitored places,
-- deduplicated weather events and delivery audit trail.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_name text not null default 'Navegador',
  platform text not null default 'web',
  browser text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  enabled boolean not null default true,
  constraint push_subscriptions_endpoint_https check (length(endpoint) between 20 and 2048 and endpoint ~ '^https://'),
  constraint push_subscriptions_p256dh_format check (length(p256dh) between 40 and 180 and p256dh ~ '^[A-Za-z0-9_-]+$'),
  constraint push_subscriptions_auth_format check (length(auth) between 10 and 100 and auth ~ '^[A-Za-z0-9_-]+$'),
  constraint push_subscriptions_device_name_length check (length(device_name) between 1 and 80),
  constraint push_subscriptions_platform_length check (length(platform) between 1 and 40),
  constraint push_subscriptions_browser_length check (length(browser) between 1 and 40)
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index push_subscriptions_active_idx on public.push_subscriptions (user_id, last_seen_at desc) where enabled;

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  notifications_enabled boolean not null default true,
  official_alerts boolean not null default true,
  rain_approaching boolean not null default true,
  heavy_rain boolean not null default true,
  storms boolean not null default true,
  lightning boolean not null default false,
  strong_wind boolean not null default true,
  extreme_heat boolean not null default true,
  air_quality boolean not null default false,
  weather_changes boolean not null default false,
  daily_summary boolean not null default false,
  minimum_severity smallint not null default 2,
  quiet_start time,
  quiet_end time,
  daily_summary_time time not null default '07:00',
  timezone text not null default 'America/Manaus',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_severity check (minimum_severity between 1 and 4),
  constraint notification_preferences_timezone check (length(timezone) between 3 and 64)
);

create table public.notification_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  city_id text not null,
  city_name text not null,
  uf text not null,
  latitude double precision not null,
  longitude double precision not null,
  timezone text not null,
  source text not null default 'saved_city',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, city_id),
  constraint notification_locations_city_id check (city_id ~ '^\d{7}$'),
  constraint notification_locations_city_name check (length(city_name) between 1 and 100),
  constraint notification_locations_uf check (uf ~ '^[A-Z]{2}$'),
  constraint notification_locations_latitude check (latitude between -90 and 90),
  constraint notification_locations_longitude check (longitude between -180 and 180),
  constraint notification_locations_timezone check (length(timezone) between 3 and 64),
  constraint notification_locations_source check (source in ('saved_city', 'searched_city', 'gps_city'))
);

create index notification_locations_user_idx on public.notification_locations (user_id);
create index notification_locations_active_idx on public.notification_locations (city_id, user_id) where enabled;

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  city_id text not null,
  city_name text not null,
  uf text not null,
  latitude double precision,
  longitude double precision,
  severity smallint not null,
  fingerprint text not null unique,
  started_at timestamptz not null,
  expires_at timestamptz not null,
  source text not null,
  title text not null,
  body text not null,
  target_url text not null default './',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint notification_events_type check (event_type in ('official_alert', 'rain_approaching', 'heavy_rain', 'storm', 'lightning', 'strong_wind', 'extreme_heat', 'air_quality', 'weather_change', 'daily_summary', 'test')),
  constraint notification_events_city_id check (city_id ~ '^\d{7}$' or city_id = 'test'),
  constraint notification_events_uf check (uf ~ '^[A-Z]{2}$' or uf = 'BR'),
  constraint notification_events_severity check (severity between 1 and 4),
  constraint notification_events_fingerprint check (length(fingerprint) between 32 and 128),
  constraint notification_events_validity check (expires_at > started_at),
  constraint notification_events_source check (length(source) between 2 and 80),
  constraint notification_events_copy check (length(title) between 1 and 120 and length(body) between 1 and 500),
  constraint notification_events_target_url check (length(target_url) between 1 and 500)
);

create index notification_events_active_idx on public.notification_events (city_id, expires_at desc);
create index notification_events_created_idx on public.notification_events (created_at desc);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.notification_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null default 'pending',
  sent_at timestamptz,
  opened_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  unique (event_id, subscription_id),
  constraint notification_deliveries_status check (status in ('pending', 'accepted', 'failed', 'expired', 'skipped')),
  constraint notification_deliveries_error_length check (error_code is null or length(error_code) <= 120)
);

create index notification_deliveries_user_idx on public.notification_deliveries (user_id, created_at desc);
create index notification_deliveries_pending_idx on public.notification_deliveries (created_at) where status = 'pending';

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function private.set_updated_at();

create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function private.set_updated_at();

create trigger notification_locations_set_updated_at
before update on public.notification_locations
for each row execute function private.set_updated_at();

alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_locations enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;

create policy push_subscriptions_select_own on public.push_subscriptions
for select to authenticated using ((select auth.uid()) = user_id);
create policy push_subscriptions_insert_own on public.push_subscriptions
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy push_subscriptions_update_own on public.push_subscriptions
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy push_subscriptions_delete_own on public.push_subscriptions
for delete to authenticated using ((select auth.uid()) = user_id);

create policy notification_preferences_select_own on public.notification_preferences
for select to authenticated using ((select auth.uid()) = user_id);
create policy notification_preferences_insert_own on public.notification_preferences
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy notification_preferences_update_own on public.notification_preferences
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy notification_locations_select_own on public.notification_locations
for select to authenticated using ((select auth.uid()) = user_id);
create policy notification_locations_insert_own on public.notification_locations
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy notification_locations_update_own on public.notification_locations
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy notification_locations_delete_own on public.notification_locations
for delete to authenticated using ((select auth.uid()) = user_id);

create policy notification_deliveries_select_own on public.notification_deliveries
for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.push_subscriptions, public.notification_preferences, public.notification_locations, public.notification_events, public.notification_deliveries from anon;
grant select, insert, update, delete on public.push_subscriptions, public.notification_preferences, public.notification_locations to authenticated;
grant select on public.notification_deliveries to authenticated;
revoke all on public.notification_events from authenticated;
grant all on public.push_subscriptions, public.notification_preferences, public.notification_locations, public.notification_events, public.notification_deliveries to service_role;

-- Only the backend service role can decrypt Web Push secrets from Vault.
create or replace function public.pluvia_push_secret_bundle()
returns table (vapid_public_key text, vapid_private_key text, vapid_subject text, cron_secret text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise insufficient_privilege using message = 'backend only';
  end if;

  return query
  select
    max(decrypted_secret) filter (where name = 'pluvia_vapid_public_key'),
    max(decrypted_secret) filter (where name = 'pluvia_vapid_private_key'),
    max(decrypted_secret) filter (where name = 'pluvia_vapid_subject'),
    max(decrypted_secret) filter (where name = 'pluvia_push_cron_secret')
  from vault.decrypted_secrets
  where name in ('pluvia_vapid_public_key', 'pluvia_vapid_private_key', 'pluvia_vapid_subject', 'pluvia_push_cron_secret');
end;
$$;

revoke all on function public.pluvia_push_secret_bundle() from public, anon, authenticated;
grant execute on function public.pluvia_push_secret_bundle() to service_role;

-- The worker authenticates with a random secret kept encrypted in Vault.
select cron.schedule(
  'pluvia-push-weather-every-5-minutes',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://dszyyrcvwrpyiypwyvxe.supabase.co/functions/v1/push-process',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pluvia-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pluvia_push_cron_secret')
      ),
      body := '{"action":"process"}'::jsonb,
      timeout_milliseconds := 25000
    );
  $job$
);

