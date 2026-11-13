-- Placar do radar (pedido do dono, 13/11/2026): medir antes de trocar a fonte do radar. A função radar-verify,
-- de hora em hora, guarda para as 27 capitais o que o radar viu em cima da cidade na hora que fechou (mesma
-- janela de 9 × 9 pixels do app, em cada quadro de 10 min) e se o aeroporto mais próximo relatou chuva.
-- A view compara com a estação do INMET (≥ 0,5 mm na hora), o aeroporto (METAR/SPECI com chuva ou garoa) e
-- os relatos do "Tá chovendo aí?" (mesma regra de forecast_report_scores): acertos, perdidas, falsos alarmes,
-- CSI, POD e FAR. Nunca acurácia. Tudo no esquema private; escrita só pelo RPC de service_role.
create table if not exists private.radar_hours (
  city_id text not null check (city_id ~ '^[0-9]{7}$'),
  source text not null check (source in ('rainviewer', 'redemet')),
  hour_end timestamptz not null,
  frames smallint not null check (frames between 1 and 12),
  wet_frames smallint not null check (wet_frames between 0 and 12 and wet_frames <= frames),
  max_share real not null check (max_share between 0 and 1),
  primary key (city_id, source, hour_end)
);
create table if not exists private.airport_hours (
  city_id text not null check (city_id ~ '^[0-9]{7}$'),
  hour_end timestamptz not null,
  icao text not null check (icao ~ '^[A-Z][A-Z0-9]{3}$'),
  reports smallint not null check (reports between 1 and 30),
  rained boolean not null,
  primary key (city_id, hour_end)
);
alter table private.radar_hours enable row level security;
alter table private.airport_hours enable row level security;
revoke all on private.radar_hours, private.airport_hours from public, anon, authenticated;

create or replace function public.pluvia_radar_store(p_radar jsonb, p_airports jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_radar integer := 0;
  stored_airports integer := 0;
begin
  insert into private.radar_hours (city_id, source, hour_end, frames, wet_frames, max_share)
  select r.city_id, r.source, r.hour_end, r.frames, r.wet_frames, r.max_share
  from jsonb_to_recordset(coalesce(p_radar, '[]'::jsonb)) as r(city_id text, source text, hour_end timestamptz, frames smallint, wet_frames smallint, max_share real)
  where r.hour_end between now() - interval '3 hours' and now() + interval '5 minutes'
  on conflict (city_id, source, hour_end) do update
    set frames = excluded.frames, wet_frames = excluded.wet_frames, max_share = excluded.max_share;
  get diagnostics stored_radar = row_count;

  insert into private.airport_hours (city_id, hour_end, icao, reports, rained)
  select a.city_id, a.hour_end, a.icao, a.reports, a.rained
  from jsonb_to_recordset(coalesce(p_airports, '[]'::jsonb)) as a(city_id text, hour_end timestamptz, icao text, reports smallint, rained boolean)
  where a.hour_end between now() - interval '3 hours' and now() + interval '5 minutes'
  on conflict (city_id, hour_end) do update
    set icao = excluded.icao, reports = excluded.reports, rained = excluded.rained;
  get diagnostics stored_airports = row_count;

  delete from private.radar_hours where hour_end < now() - interval '180 days';
  delete from private.airport_hours where hour_end < now() - interval '180 days';
  return jsonb_build_object('radar', stored_radar, 'airports', stored_airports);
end;
$$;
revoke all on function public.pluvia_radar_store(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.pluvia_radar_store(jsonb, jsonb) to service_role;

-- Últimos 30 dias, por capital, fonte do radar e referência. "Radar disse chuva" = algum quadro da hora com a
-- cidade molhada. Referências: estação (≥ 0,5 mm na hora), aeroporto (chuva ou garoa em algum boletim da hora)
-- e relatos (mais relatos de chuva que de seco, com pelo menos 2; empate fica de fora).
create or replace view private.radar_scores as
with radar as (
  select city_id, source, hour_end, wet_frames > 0 as said_rain
  from private.radar_hours where hour_end > now() - interval '30 days'
), refs as (
  select city_id, observed_at as hour_end, 'estacao'::text as reference, precip_mm >= 0.5 as rained
  from private.station_observations where precip_mm is not null and observed_at > now() - interval '30 days'
  union all
  select city_id, hour_end, 'aeroporto', rained from private.airport_hours where hour_end > now() - interval '30 days'
  union all
  select city_id, hour_end, 'relatos', (drizzle + rain + heavy) > dry
  from private.report_hours
  where hour_end > now() - interval '30 days' and drizzle + rain + heavy + dry >= 2 and drizzle + rain + heavy <> dry
), counted as (
  select r.city_id, r.source, f.reference,
    count(*) as hours,
    count(*) filter (where f.rained) as rain_hours,
    count(*) filter (where r.said_rain and f.rained) as hits,
    count(*) filter (where not r.said_rain and f.rained) as misses,
    count(*) filter (where r.said_rain and not f.rained) as false_alarms
  from radar r join refs f on f.city_id = r.city_id and f.hour_end = r.hour_end
  group by r.city_id, r.source, f.reference
)
select city_id,
  case left(city_id, 1) when '1' then 'Norte' when '2' then 'Nordeste' when '3' then 'Sudeste' when '4' then 'Sul' else 'Centro-Oeste' end as region,
  source, reference, hours, rain_hours, hits, misses, false_alarms,
  round((hits::numeric / nullif(hits + misses + false_alarms, 0)) * 100, 1) as csi_pct,
  round((hits::numeric / nullif(hits + misses, 0)) * 100, 1) as pod_pct,
  round((false_alarms::numeric / nullif(hits + false_alarms, 0)) * 100, 1) as far_pct
from counted;
revoke all on private.radar_scores from public, anon, authenticated;

-- O mesmo por região (para a decisão "REDEMET no Norte, no Brasil todo ou em nenhum lugar").
create or replace view private.radar_region_scores as
select region, source, reference, sum(hours) as hours, sum(rain_hours) as rain_hours,
  sum(hits) as hits, sum(misses) as misses, sum(false_alarms) as false_alarms,
  round((sum(hits) / nullif(sum(hits + misses + false_alarms), 0)) * 100, 1) as csi_pct,
  round((sum(hits) / nullif(sum(hits + misses), 0)) * 100, 1) as pod_pct,
  round((sum(false_alarms) / nullif(sum(hits + false_alarms), 0)) * 100, 1) as far_pct
from private.radar_scores
group by region, source, reference;
revoke all on private.radar_region_scores from public, anon, authenticated;

-- De hora em hora, aos 12 minutos: o quadro das :00 do RainViewer já saiu e os METAR das :00 também.
select cron.unschedule(jobid) from cron.job where jobname = 'pluvia-radar-verify-hourly';
select cron.schedule(
  'pluvia-radar-verify-hourly',
  '12 * * * *',
  $job$
    select net.http_post(
      url := 'https://dszyyrcvwrpyiypwyvxe.supabase.co/functions/v1/radar-verify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pluvia-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pluvia_push_cron_secret')
      ),
      body := '{"action":"verify"}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);
