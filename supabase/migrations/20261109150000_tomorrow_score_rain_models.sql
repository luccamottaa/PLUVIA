-- Tomorrow.io no placar e vencedores de chuva para o app (pedido do dono, novembro/2026).
--
-- 1. forecast-verify passa a gravar o Tomorrow.io como o "modelo" tomorrow_io em private.forecast_samples e
--    private.forecast_windows (forecast_scores e forecast_window_scores já agrupam por modelo). Ele não é
--    modelo do Open-Meteo: a troca de chuva pede `models=<vencedor>` ao Open-Meteo, então forecast_best_model
--    e pluvia_rain_model só escolhem entre os modelos do Open-Meteo.
-- 2. public.pluvia_rain_models(): lista pública (anon) só com id IBGE da capital → modelo vencedor de chuva,
--    pela mesma regra de pluvia_rain_model. São nomes de modelo derivados de totais; nenhum dado de pessoa.

create or replace view private.forecast_best_model as
with rain as (
  select distinct on (city_id, lead_hours) city_id, lead_hours, model, csi_pct, brier, hits + misses as rain_events
  from private.forecast_scores
  where rain_samples >= 300 and hits + misses >= 15 and csi_pct is not null
    and model in ('best_match', 'ecmwf_ifs025', 'gfs_seamless', 'icon_seamless')
  order by city_id, lead_hours, csi_pct desc, brier
), temp as (
  select distinct on (city_id, lead_hours) city_id, lead_hours, model, temp_mae_c
  from private.forecast_scores
  where temp_samples >= 200 and temp_mae_c is not null
    and model in ('best_match', 'ecmwf_ifs025', 'gfs_seamless', 'icon_seamless')
  order by city_id, lead_hours, temp_mae_c
), keys as (
  select distinct city_id, lead_hours from private.forecast_scores
)
select k.city_id, k.lead_hours, r.model as rain_model, r.csi_pct as rain_csi_pct, r.brier as rain_brier, r.rain_events,
  t.model as temp_model, t.temp_mae_c
from keys k
left join rain r using (city_id, lead_hours)
left join temp t using (city_id, lead_hours);

create or replace function public.pluvia_rain_model(p_city text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select b.rain_model
  from private.forecast_best_model b
  join private.forecast_scores w on w.city_id = b.city_id and w.lead_hours = b.lead_hours and w.model = b.rain_model
  join private.forecast_scores d on d.city_id = b.city_id and d.lead_hours = b.lead_hours and d.model = 'best_match'
  where p_city ~ '^[0-9]{7}$' and b.city_id = p_city and b.lead_hours = 6
    and b.rain_model in ('ecmwf_ifs025', 'gfs_seamless', 'icon_seamless')
    and w.csi_pct >= coalesce(d.csi_pct, 0) + 5
    and w.prob_samples >= 0.9 * w.rain_samples
  limit 1;
$$;

revoke all on function public.pluvia_rain_model(text) from public, anon, authenticated;
grant execute on function public.pluvia_rain_model(text) to service_role;

create or replace function public.pluvia_rain_models()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(b.city_id, b.rain_model), '{}'::jsonb)
  from private.forecast_best_model b
  join private.forecast_scores w on w.city_id = b.city_id and w.lead_hours = b.lead_hours and w.model = b.rain_model
  join private.forecast_scores d on d.city_id = b.city_id and d.lead_hours = b.lead_hours and d.model = 'best_match'
  where b.lead_hours = 6
    and b.rain_model in ('ecmwf_ifs025', 'gfs_seamless', 'icon_seamless')
    and w.csi_pct >= coalesce(d.csi_pct, 0) + 5
    and w.prob_samples >= 0.9 * w.rain_samples;
$$;

revoke all on function public.pluvia_rain_models() from public;
grant execute on function public.pluvia_rain_models() to anon, authenticated, service_role;
