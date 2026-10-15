-- Placar de acerto, segunda versão (outubro/2026). A primeira view media a chuva por acurácia ("bateu
-- choveu/não choveu"): com ~2,5% das horas chuvosas nas capitais, um modelo que nunca prevê chuva tirava
-- ~97% e o placar premiava justamente quem erra a chuva convectiva. Esta migration:
--   1. guarda a probabilidade de chuva de cada previsão (sem ela não há calibração nem Brier);
--   2. guarda a resposta "Vai chover?" de cada modelo para as próximas 3 h e 12 h (a frase que o app mostra),
--      com a mesma regra de weatherInsights.rainAnswer;
--   3. troca a acurácia por acerto de chuva (POD), falso alarme (FAR), CSI e Brier.
-- Publicar esta migration ANTES da nova forecast-verify: a função nova chama o RPC com `windows`.
-- A função antiga continua funcionando depois desta migration (o parâmetro novo tem padrão).

alter table private.forecast_samples
  add column if not exists precip_prob smallint check (precip_prob between 0 and 100);

create table if not exists private.forecast_windows (
  city_id text not null check (city_id ~ '^[0-9]{7}$'),
  model text not null check (model ~ '^[a-z0-9_]{2,40}$'),
  issued_at timestamptz not null,
  window_hours smallint not null check (window_hours in (3, 12)),
  answer text not null check (answer in ('rain', 'maybe', 'dry')),
  max_prob smallint check (max_prob between 0 and 100),
  total_mm real check (total_mm between 0 and 1000),
  primary key (city_id, model, issued_at, window_hours)
);
alter table private.forecast_windows enable row level security;
revoke all on private.forecast_windows from public, anon, authenticated;

drop function if exists public.pluvia_verify_store(jsonb, jsonb);
create or replace function public.pluvia_verify_store(samples jsonb, observations jsonb, windows jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_samples integer := 0;
  stored_observations integer := 0;
  stored_windows integer := 0;
begin
  if jsonb_typeof(samples) <> 'array' or jsonb_typeof(observations) <> 'array' or jsonb_typeof(windows) <> 'array'
     or jsonb_array_length(samples) > 2000 or jsonb_array_length(observations) > 200 or jsonb_array_length(windows) > 1000 then
    raise exception 'invalid_payload';
  end if;

  insert into private.forecast_samples (city_id, model, lead_hours, target_at, temp_c, precip_mm, precip_prob)
  select s.city_id, s.model, s.lead_hours, s.target_at, s.temp_c, s.precip_mm, s.precip_prob
  from jsonb_to_recordset(samples) as s(city_id text, model text, lead_hours smallint, target_at timestamptz, temp_c real, precip_mm real, precip_prob smallint)
  where s.target_at between now() - interval '2 hours' and now() + interval '73 hours'
  on conflict (city_id, model, lead_hours, target_at) do nothing;
  get diagnostics stored_samples = row_count;

  insert into private.station_observations (city_id, observed_at, temp_c, precip_mm, station_ibge, distance_km)
  select o.city_id, o.observed_at, o.temp_c, o.precip_mm, o.station_ibge, o.distance_km
  from jsonb_to_recordset(observations) as o(city_id text, observed_at timestamptz, temp_c real, precip_mm real, station_ibge text, distance_km real)
  where o.observed_at between now() - interval '4 hours' and now() + interval '15 minutes'
  on conflict (city_id, observed_at) do update
    set temp_c = coalesce(excluded.temp_c, private.station_observations.temp_c),
        precip_mm = coalesce(excluded.precip_mm, private.station_observations.precip_mm);
  get diagnostics stored_observations = row_count;

  insert into private.forecast_windows (city_id, model, issued_at, window_hours, answer, max_prob, total_mm)
  select w.city_id, w.model, w.issued_at, w.window_hours, w.answer, w.max_prob, w.total_mm
  from jsonb_to_recordset(windows) as w(city_id text, model text, issued_at timestamptz, window_hours smallint, answer text, max_prob smallint, total_mm real)
  where w.issued_at between now() - interval '2 hours' and now() + interval '15 minutes'
  on conflict (city_id, model, issued_at, window_hours) do nothing;
  get diagnostics stored_windows = row_count;

  return jsonb_build_object('samples', stored_samples, 'observations', stored_observations, 'windows', stored_windows);
end;
$$;

revoke all on function public.pluvia_verify_store(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.pluvia_verify_store(jsonb, jsonb, jsonb) to service_role;

-- Hora cheia, 6 h e 24 h à frente. Chuva = ≥ 0,5 mm na hora (previsão e estação).
-- POD: das horas que choveram, quantas o modelo previu. FAR: das horas em que previu, quantas não choveram.
-- CSI: acertos / (acertos + perdidas + falsos alarmes), sem premiar os "secos" fáceis.
-- Brier: erro quadrático médio da probabilidade (0 é perfeito); base_rate permite comparar com a climatologia.
-- Divisões por zero viram null: com poucos eventos, a métrica não existe ainda.
drop view if exists private.forecast_scores;
create view private.forecast_scores as
with pairs as (
  select f.city_id, f.model, f.lead_hours, f.temp_c as f_temp, o.temp_c as o_temp, f.precip_mm as f_mm, o.precip_mm as o_mm, f.precip_prob
  from private.forecast_samples f
  join private.station_observations o on o.city_id = f.city_id and o.observed_at = f.target_at
  where f.target_at > now() - interval '30 days'
), counted as (
  select city_id, model, lead_hours,
    count(*) filter (where f_temp is not null and o_temp is not null) as temp_samples,
    avg(abs(f_temp - o_temp)) filter (where f_temp is not null and o_temp is not null) as temp_mae,
    avg(f_temp - o_temp) filter (where f_temp is not null and o_temp is not null) as temp_bias,
    count(*) filter (where f_mm is not null and o_mm is not null) as rain_samples,
    count(*) filter (where f_mm >= 0.5 and o_mm >= 0.5) as hits,
    count(*) filter (where f_mm < 0.5 and o_mm >= 0.5) as misses,
    count(*) filter (where f_mm >= 0.5 and o_mm < 0.5) as false_alarms,
    count(*) filter (where precip_prob is not null and o_mm is not null) as prob_samples,
    avg(power(precip_prob / 100.0 - case when o_mm >= 0.5 then 1 else 0 end, 2)) filter (where precip_prob is not null and o_mm is not null) as brier,
    avg(case when o_mm >= 0.5 then 1.0 else 0.0 end) filter (where o_mm is not null) as base_rate
  from pairs
  group by city_id, model, lead_hours
)
select city_id, model, lead_hours, temp_samples,
  round(temp_mae::numeric, 2) as temp_mae_c,
  round(temp_bias::numeric, 2) as temp_bias_c,
  rain_samples, hits, misses, false_alarms,
  round((base_rate * 100)::numeric, 1) as base_rate_pct,
  round((hits::numeric / nullif(hits + misses, 0)) * 100, 1) as pod_pct,
  round((false_alarms::numeric / nullif(hits + false_alarms, 0)) * 100, 1) as far_pct,
  round((hits::numeric / nullif(hits + misses + false_alarms, 0)) * 100, 1) as csi_pct,
  prob_samples,
  round(brier::numeric, 4) as brier
from counted;
revoke all on private.forecast_scores from public, anon, authenticated;

-- A resposta do app nas próximas 3 h / 12 h contra o que a estação mediu nas mesmas horas. Choveu = alguma
-- hora da janela com ≥ 0,5 mm; janela só conta com TODAS as horas medidas (lacuna não vira seco).
-- dry_but_rained: o pior erro para quem usa ("sem chuva prevista" e choveu). maybe_rained_pct: quando o
-- app disse "pode chover", quantas vezes choveu. brier_max_prob: Brier da chance máxima mostrada na janela.
create or replace view private.forecast_window_scores as
with observed as (
  select w.city_id, w.model, w.window_hours, w.answer, w.max_prob,
    count(o.precip_mm) as measured_hours,
    bool_or(o.precip_mm >= 0.5) as rained
  from private.forecast_windows w
  join private.station_observations o
    on o.city_id = w.city_id
   and o.observed_at > w.issued_at
   and o.observed_at <= w.issued_at + make_interval(hours => w.window_hours)
  where w.issued_at > now() - interval '30 days'
  group by w.city_id, w.model, w.issued_at, w.window_hours, w.answer, w.max_prob
), complete as (
  select * from observed where measured_hours = window_hours
)
select city_id, model, window_hours,
  count(*) as windows,
  round(avg(case when rained then 1.0 else 0.0 end) * 100, 1) as base_rate_pct,
  count(*) filter (where answer = 'rain' and rained) as hits,
  count(*) filter (where answer <> 'rain' and rained) as misses,
  count(*) filter (where answer = 'rain' and not rained) as false_alarms,
  count(*) filter (where answer = 'dry' and rained) as dry_but_rained,
  round((count(*) filter (where answer = 'rain' and rained))::numeric / nullif(count(*) filter (where rained), 0) * 100, 1) as pod_pct,
  round((count(*) filter (where answer = 'rain' and not rained))::numeric / nullif(count(*) filter (where answer = 'rain'), 0) * 100, 1) as far_pct,
  round((count(*) filter (where answer = 'rain' and rained))::numeric / nullif(count(*) filter (where answer = 'rain' or rained), 0) * 100, 1) as csi_pct,
  round((count(*) filter (where answer = 'maybe' and rained))::numeric / nullif(count(*) filter (where answer = 'maybe'), 0) * 100, 1) as maybe_rained_pct,
  round(avg(power(max_prob / 100.0 - case when rained then 1 else 0 end, 2)) filter (where max_prob is not null)::numeric, 4) as brier_max_prob
from complete
group by city_id, model, window_hours;
revoke all on private.forecast_window_scores from public, anon, authenticated;
