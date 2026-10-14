-- Placar de acerto da previsão (pedido do usuário, outubro/2026): a função forecast-verify guarda, de hora
-- em hora, a previsão de cada modelo do Open-Meteo para as 27 capitais (6 h e 24 h à frente) e a leitura
-- da estação automática do INMET mais próxima. A view compara as duas e mostra qual modelo erra menos em
-- cada cidade. Nada sai daqui para o navegador: tabelas no esquema private, escrita só pelo RPC de
-- service_role. Volume: ~5 mil amostras por dia; a limpeza das linhas antigas fica para uma migration
-- própria (comandos de exclusão pedem aprovação do dono no painel).
create schema if not exists private;

create table if not exists private.forecast_samples (
  city_id text not null check (city_id ~ '^[0-9]{7}$'),
  model text not null check (model ~ '^[a-z0-9_]{2,40}$'),
  lead_hours smallint not null check (lead_hours between 1 and 72),
  target_at timestamptz not null,
  temp_c real check (temp_c between -40 and 60),
  precip_mm real check (precip_mm between 0 and 300),
  issued_at timestamptz not null default now(),
  primary key (city_id, model, lead_hours, target_at)
);

create table if not exists private.station_observations (
  city_id text not null check (city_id ~ '^[0-9]{7}$'),
  observed_at timestamptz not null,
  temp_c real check (temp_c between -40 and 60),
  precip_mm real check (precip_mm between 0 and 300),
  station_ibge text check (station_ibge ~ '^[0-9]{7}$'),
  distance_km real check (distance_km between 0 and 60),
  primary key (city_id, observed_at)
);

alter table private.forecast_samples enable row level security;
alter table private.station_observations enable row level security;
revoke all on private.forecast_samples, private.station_observations from public, anon, authenticated;

create or replace function public.pluvia_verify_store(samples jsonb, observations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_samples integer := 0;
  stored_observations integer := 0;
begin
  if jsonb_typeof(samples) <> 'array' or jsonb_typeof(observations) <> 'array'
     or jsonb_array_length(samples) > 2000 or jsonb_array_length(observations) > 200 then
    raise exception 'invalid_payload';
  end if;

  insert into private.forecast_samples (city_id, model, lead_hours, target_at, temp_c, precip_mm)
  select s.city_id, s.model, s.lead_hours, s.target_at, s.temp_c, s.precip_mm
  from jsonb_to_recordset(samples) as s(city_id text, model text, lead_hours smallint, target_at timestamptz, temp_c real, precip_mm real)
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

  return jsonb_build_object('samples', stored_samples, 'observations', stored_observations);
end;
$$;

revoke all on function public.pluvia_verify_store(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.pluvia_verify_store(jsonb, jsonb) to service_role;

-- Erro médio absoluto da temperatura, viés (positivo = modelo mais quente que a estação) e acerto de
-- "choveu ou não" (≥ 0,5 mm na hora) por cidade, modelo e antecedência, nos últimos 30 dias.
create or replace view private.forecast_scores as
select f.city_id, f.model, f.lead_hours,
  count(*) filter (where f.temp_c is not null and o.temp_c is not null) as temp_samples,
  round(avg(abs(f.temp_c - o.temp_c)) filter (where f.temp_c is not null and o.temp_c is not null)::numeric, 2) as temp_mae_c,
  round(avg(f.temp_c - o.temp_c) filter (where f.temp_c is not null and o.temp_c is not null)::numeric, 2) as temp_bias_c,
  count(*) filter (where f.precip_mm is not null and o.precip_mm is not null) as rain_samples,
  round((avg(case when (f.precip_mm >= 0.5) = (o.precip_mm >= 0.5) then 1 else 0 end)
    filter (where f.precip_mm is not null and o.precip_mm is not null) * 100)::numeric, 1) as rain_hit_pct,
  count(*) filter (where o.precip_mm >= 0.5) as rainy_hours,
  count(*) filter (where o.precip_mm >= 0.5 and f.precip_mm >= 0.5) as rainy_hours_caught
from private.forecast_samples f
join private.station_observations o on o.city_id = f.city_id and o.observed_at = f.target_at
where f.target_at > now() - interval '30 days'
group by f.city_id, f.model, f.lead_hours;

revoke all on private.forecast_scores from public, anon, authenticated;

-- De hora em hora, aos 25 minutos (o INMET publica a hora fechada com ~20 min de atraso).
select cron.schedule(
  'pluvia-forecast-verify-hourly',
  '25 * * * *',
  $job$
    select net.http_post(
      url := 'https://dszyyrcvwrpyiypwyvxe.supabase.co/functions/v1/forecast-verify',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pluvia-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pluvia_push_cron_secret')
      ),
      body := '{"action":"verify"}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);
