-- Quanto o PLUVIA acerta, mais honesto (1.75, pedido do dono): além das janelas de 3 h e 12 h, o RPC devolve os
-- totais da hora exata (private.forecast_scores, best_match, previsão feita 6 h antes; chuva = ≥ 0,5 mm na hora),
-- para a tela dizer claramente que acertar a hora é bem mais difícil. Só contagens; nenhuma linha individual.
-- O app antigo ignora a chave nova; o app novo sem ela mostra a frase sem número.
create or replace function public.pluvia_forecast_accuracy(p_city text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with observed as (
    select w.window_hours, w.answer, count(o.precip_mm) as measured, bool_or(o.precip_mm >= 0.5) as rained
    from private.forecast_windows w
    join private.station_observations o
      on o.city_id = w.city_id and o.observed_at > w.issued_at
     and o.observed_at <= w.issued_at + make_interval(hours => w.window_hours::integer)
    where p_city ~ '^\d{7}$' and w.city_id = p_city and w.model = 'best_match'
      and w.issued_at > now() - interval '30 days'
    group by w.window_hours, w.issued_at, w.answer
  ), complete as (
    select * from observed where measured = window_hours
  ), totals as (
    select window_hours as hours,
      count(*) as windows,
      count(*) filter (where rained) as rained,
      count(*) filter (where answer = 'rain' and rained) as hits,
      count(*) filter (where answer <> 'rain' and rained) as misses,
      count(*) filter (where answer = 'rain' and not rained) as false_alarms,
      count(*) filter (where answer = 'dry' and rained) as dry_but_rained,
      count(*) filter (where answer = 'dry' and not rained) as dry_right,
      count(*) filter (where answer = 'dry') as said_dry
    from complete group by window_hours
  )
  select jsonb_build_object(
    'city', p_city,
    'since', (select min(issued_at) from private.forecast_windows
              where p_city ~ '^\d{7}$' and city_id = p_city and model = 'best_match' and issued_at > now() - interval '30 days'),
    'windows', coalesce((select jsonb_agg(to_jsonb(t) order by t.hours) from totals t), '[]'::jsonb),
    'hourly', (select jsonb_build_object('lead_hours', s.lead_hours, 'hours', s.rain_samples, 'hits', s.hits,
                                         'misses', s.misses, 'false_alarms', s.false_alarms)
               from private.forecast_scores s
               where p_city ~ '^\d{7}$' and s.city_id = p_city and s.model = 'best_match' and s.lead_hours = 6)
  );
$$;
revoke all on function public.pluvia_forecast_accuracy(text) from public;
grant execute on function public.pluvia_forecast_accuracy(text) to anon, authenticated, service_role;
