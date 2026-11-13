-- Temperatura pelo modelo que mais acerta em cada capital (13/11/2026, pedido do dono: "faz todos", item 1).
-- Mesma ideia de pluvia_rain_models: lista pública (anon) só com id IBGE da capital → modelo do Open-Meteo, quando
-- o vencedor de temperatura (6 h à frente) erra pelo menos 0,3 °C a menos que o best_match, com 200+ amostras. O
-- Tomorrow.io não entra: a cota grátis não aguenta uma consulta por pessoa. Nenhum dado de pessoa.
create or replace function public.pluvia_temp_models()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(b.city_id, b.temp_model), '{}'::jsonb)
  from private.forecast_best_model b
  join private.forecast_scores w on w.city_id = b.city_id and w.lead_hours = b.lead_hours and w.model = b.temp_model
  join private.forecast_scores d on d.city_id = b.city_id and d.lead_hours = b.lead_hours and d.model = 'best_match'
  where b.lead_hours = 6
    and b.temp_model in ('ecmwf_ifs025', 'gfs_seamless', 'icon_seamless')
    and w.temp_samples >= 200
    and d.temp_mae_c - w.temp_mae_c >= 0.3;
$$;

revoke all on function public.pluvia_temp_models() from public;
grant execute on function public.pluvia_temp_models() to anon, authenticated, service_role;
