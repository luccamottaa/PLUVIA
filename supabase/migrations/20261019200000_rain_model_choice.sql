-- Melhor modelo de chuva por cidade para os avisos (outubro/2026, pedido do dono). Só a chuva (volume e
-- chance por hora) troca de modelo; temperatura e o resto continuam no best_match, que erra menos a
-- temperatura. O vencedor precisa, na antecedência de 6 h e nos últimos 30 dias:
--   * aparecer em private.forecast_best_model (≥ 300 pares e ≥ 15 horas chuvosas medidas);
--   * ter CSI pelo menos 5 pontos acima do best_match (sem trocar por ruído);
--   * entregar a chance de chuva em ≥ 90% das horas (o aviso exige volume e chance da mesma amostra).
-- Sem vencedor, null: o push-process segue com o best_match. Só service_role chama.
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
    and b.rain_model is not null and b.rain_model <> 'best_match'
    and w.csi_pct >= coalesce(d.csi_pct, 0) + 5
    and w.prob_samples >= 0.9 * w.rain_samples
  limit 1;
$$;

revoke all on function public.pluvia_rain_model(text) from public, anon, authenticated;
grant execute on function public.pluvia_rain_model(text) to service_role;
