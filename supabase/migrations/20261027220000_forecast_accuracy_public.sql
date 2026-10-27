-- Quanto o PLUVIA acerta (1.37, pedido do dono): o app lê, com a chave publicável, só totais por cidade da
-- resposta "Vai chover?" do modelo que a tela usa (best_match) contra a estação do INMET mais próxima, nas
-- próximas 3 h e 12 h, nos últimos 30 dias. Mesmas regras de private.forecast_window_scores: choveu = alguma
-- hora com ≥ 0,5 mm e todas as horas da janela medidas. Nada é gravado; nenhuma linha individual sai daqui.
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
    'windows', coalesce((select jsonb_agg(to_jsonb(t) order by t.hours) from totals t), '[]'::jsonb)
  );
$$;
revoke all on function public.pluvia_forecast_accuracy(text) from public;
grant execute on function public.pluvia_forecast_accuracy(text) to anon, authenticated, service_role;
