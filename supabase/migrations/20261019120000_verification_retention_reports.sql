-- Placar de acerto, terceira parte (outubro/2026, pedido do dono):
--   1. limpeza automática: amostras, observações, janelas e relatos agregados com mais de 180 dias saem
--      uma vez por dia (prazo escolhido pelo dono);
--   2. "Tá chovendo aí?" entra no placar: a cada hora, os relatos da hora fechada viram uma contagem por
--      cidade (sem hash do aparelho, sem linha individual) e são comparados com a previsão de cada modelo;
--   3. melhor modelo por cidade: só aparece quando há eventos de chuva suficientes para comparar. Nada
--      disso vai para o app nem muda os avisos sozinho.

-- Contagem dos relatos da hora que TERMINA em hour_end (mesmo intervalo da precipitação do Open-Meteo).
-- Os relatos individuais continuam sendo apagados em 2 dias por pluvia_rain_report.
create table if not exists private.report_hours (
  city_id text not null check (city_id ~ '^[0-9]{7}$'),
  hour_end timestamptz not null,
  dry smallint not null default 0 check (dry >= 0),
  drizzle smallint not null default 0 check (drizzle >= 0),
  rain smallint not null default 0 check (rain >= 0),
  heavy smallint not null default 0 check (heavy >= 0),
  primary key (city_id, hour_end)
);
alter table private.report_hours enable row level security;
revoke all on private.report_hours from public, anon, authenticated;

-- Refaz as últimas 3 horas fechadas (relato atrasado ou cron perdido não somem).
create or replace function private.pluvia_report_hours_refresh()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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
  from public.rain_reports
  where created_at > date_trunc('hour', now()) - interval '3 hours'
    and created_at <= date_trunc('hour', now())
  group by 1, 2
  on conflict (city_id, hour_end) do update
    set dry = excluded.dry, drizzle = excluded.drizzle, rain = excluded.rain, heavy = excluded.heavy;
  get diagnostics stored = row_count;
  return stored;
end;
$$;

create or replace function private.pluvia_verify_prune()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  samples integer; observations integer; windows integer; reports integer;
begin
  delete from private.forecast_samples where target_at < now() - interval '180 days';
  get diagnostics samples = row_count;
  delete from private.station_observations where observed_at < now() - interval '180 days';
  get diagnostics observations = row_count;
  delete from private.forecast_windows where issued_at < now() - interval '180 days';
  get diagnostics windows = row_count;
  delete from private.report_hours where hour_end < now() - interval '180 days';
  get diagnostics reports = row_count;
  return jsonb_build_object('samples', samples, 'observations', observations, 'windows', windows, 'reports', reports);
end;
$$;

revoke all on function private.pluvia_report_hours_refresh() from public, anon, authenticated;
revoke all on function private.pluvia_verify_prune() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('pluvia-report-hours', 'pluvia-verify-prune');
select cron.schedule('pluvia-report-hours', '3 * * * *', $job$ select private.pluvia_report_hours_refresh(); $job$);
select cron.schedule('pluvia-verify-prune', '47 6 * * *', $job$ select private.pluvia_verify_prune(); $job$);

-- Previsão de cada modelo contra o que as pessoas relataram na mesma hora. Choveu = mais relatos de
-- chuva (garoa, chuva ou forte) que de seco, com pelo menos 2 relatos; empate fica de fora. É relato
-- de pessoas, não medição: serve de segunda opinião onde a estação está longe ou fora do ar.
create or replace view private.forecast_report_scores as
with judged as (
  select city_id, hour_end, (drizzle + rain + heavy) > dry as rained
  from private.report_hours
  where hour_end > now() - interval '30 days'
    and dry + drizzle + rain + heavy >= 2
    and (drizzle + rain + heavy) <> dry
)
select f.city_id, f.model, f.lead_hours,
  count(*) as report_hours,
  count(*) filter (where j.rained) as rained_hours,
  count(*) filter (where f.precip_mm >= 0.5 and j.rained) as hits,
  count(*) filter (where f.precip_mm < 0.5 and j.rained) as misses,
  count(*) filter (where f.precip_mm >= 0.5 and not j.rained) as false_alarms,
  round((count(*) filter (where f.precip_mm >= 0.5 and j.rained))::numeric
    / nullif(count(*) filter (where j.rained), 0) * 100, 1) as pod_pct,
  round((count(*) filter (where f.precip_mm >= 0.5 and not j.rained))::numeric
    / nullif(count(*) filter (where f.precip_mm >= 0.5), 0) * 100, 1) as far_pct
from private.forecast_samples f
join judged j on j.city_id = f.city_id and j.hour_end = f.target_at
where f.precip_mm is not null
group by f.city_id, f.model, f.lead_hours;
revoke all on private.forecast_report_scores from public, anon, authenticated;

-- Melhor modelo por cidade e antecedência. Chuva: maior CSI (desempate pelo Brier), só com pelo menos
-- 15 horas chuvosas medidas e 300 pares; temperatura: menor erro médio com pelo menos 200 pares.
-- Sem dado suficiente a coluna fica null: não há "melhor" com meia dúzia de chuvas.
create or replace view private.forecast_best_model as
with rain as (
  select distinct on (city_id, lead_hours) city_id, lead_hours, model, csi_pct, brier, hits + misses as rain_events
  from private.forecast_scores
  where rain_samples >= 300 and hits + misses >= 15 and csi_pct is not null
  order by city_id, lead_hours, csi_pct desc, brier asc nulls last
), temp as (
  select distinct on (city_id, lead_hours) city_id, lead_hours, model, temp_mae_c
  from private.forecast_scores
  where temp_samples >= 200 and temp_mae_c is not null
  order by city_id, lead_hours, temp_mae_c asc
), keys as (
  select distinct city_id, lead_hours from private.forecast_scores
)
select k.city_id, k.lead_hours,
  r.model as rain_model, r.csi_pct as rain_csi_pct, r.brier as rain_brier, r.rain_events,
  t.model as temp_model, t.temp_mae_c
from keys k
left join rain r using (city_id, lead_hours)
left join temp t using (city_id, lead_hours);
revoke all on private.forecast_best_model from public, anon, authenticated;
