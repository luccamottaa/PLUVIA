-- Keep operational/analytics tables out of the exposed PostgREST public schema.
alter table public.daily_visit_devices set schema private;
alter table public.daily_visits set schema private;
alter table public.rain_reports set schema private;

create or replace function public.pluvia_count_visit(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  visit_day date := (now() at time zone 'America/Sao_Paulo')::date;
  inserted integer;
  hashed text;
begin
  if p_device_id is null then
    return false;
  end if;

  hashed := encode(extensions.digest('pluvia-visit:' || p_device_id::text, 'sha256'), 'hex');

  delete from private.daily_visit_devices
  where day < visit_day;

  insert into private.daily_visit_devices(day, device_hash)
  values (visit_day, hashed)
  on conflict (day, device_hash) do nothing;

  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false;
  end if;

  insert into private.daily_visits(day, visits)
  values (visit_day, 1)
  on conflict (day) do update
    set visits = private.daily_visits.visits + 1;

  return true;
end;
$function$;

create or replace function public.pluvia_rain_report(p_city text, p_kind text, p_device text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  device text;
begin
  if p_city is null or p_city !~ '^[0-9]{7}$' or p_kind is null or p_kind not in ('dry', 'drizzle', 'rain', 'heavy')
     or p_device is null or p_device !~ '^[0-9a-f-]{32,36}$' then
    return 'invalid';
  end if;

  device := encode(extensions.digest('pluvia-rain:' || p_device, 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(device, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pluvia-rain-city:' || p_city, 0));

  delete from private.rain_reports where created_at < now() - interval '2 days';

  if exists (
    select 1 from private.rain_reports
    where device_hash = device and created_at > now() - interval '15 minutes'
  ) then
    return 'duplicate';
  end if;

  if (
    select count(*) from private.rain_reports
    where city_id = p_city and created_at > now() - interval '10 minutes'
  ) >= 60 then
    return 'busy';
  end if;

  insert into private.rain_reports (city_id, kind, device_hash)
  values (p_city, p_kind, device);

  return 'ok';
end;
$function$;

create or replace function public.pluvia_rain_reports(p_city text)
returns table(dry integer, drizzle integer, rain integer, heavy integer, latest timestamptz)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    count(*) filter (where kind = 'dry')::integer,
    count(*) filter (where kind = 'drizzle')::integer,
    count(*) filter (where kind = 'rain')::integer,
    count(*) filter (where kind = 'heavy')::integer,
    max(created_at)
  from private.rain_reports
  where p_city ~ '^[0-9]{7}$' and city_id = p_city and created_at > now() - interval '60 minutes';
$function$;

create or replace function private.pluvia_report_hours_refresh()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  stored integer := 0;
begin
  insert into private.report_hours (city_id, hour_end, dry, drizzle, rain, heavy)
  select city_id,
    date_trunc('hour', created_at - interval '1 microsecond') + interval '1 hour' as hour_end,
    count(*) filter (where kind = 'dry'),
    count(*) filter (where kind = 'drizzle'),
    count(*) filter (where kind = 'rain'),
    count(*) filter (where kind = 'heavy')
  from private.rain_reports
  where created_at > date_trunc('hour', now()) - interval '3 hours'
    and created_at <= date_trunc('hour', now())
  group by 1, 2
  on conflict (city_id, hour_end) do update
    set dry = excluded.dry, drizzle = excluded.drizzle, rain = excluded.rain, heavy = excluded.heavy;
  get diagnostics stored = row_count;
  return stored;
end;
$function$;

select cron.unschedule(8);
select cron.schedule(
  'pluvia-visit-device-prune-hourly',
  '0 * * * *',
  $job$delete from private.daily_visit_devices where day < (now() at time zone 'America/Sao_Paulo')::date;$job$
);
