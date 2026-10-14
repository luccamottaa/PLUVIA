-- Nível dos rios (ANA) e focos de calor (INPE), pedido do usuário em outubro/2026. A função
-- environment-refresh (só cron) guarda um resumo por tipo; o app lê o da cidade aberta pelo RPC
-- pluvia_city_environment com a chave publicável. O pedido leva só o código IBGE e as coordenadas de
-- referência do município (nunca GPS) e nada é gravado.
create schema if not exists private;

create table if not exists private.environment_snapshots (
  kind text primary key check (kind in ('rivers', 'fires')),
  updated_at timestamptz not null default now(),
  data jsonb not null
);

alter table private.environment_snapshots enable row level security;
revoke all on private.environment_snapshots from public, anon, authenticated;

create or replace function public.pluvia_environment_store(p_kind text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_kind not in ('rivers', 'fires') or jsonb_typeof(p_data) <> 'object' or pg_column_size(p_data) > 4000000 then
    raise exception 'invalid_payload';
  end if;
  insert into private.environment_snapshots (kind, updated_at, data) values (p_kind, now(), p_data)
  on conflict (kind) do update set updated_at = excluded.updated_at, data = excluded.data;
end;
$$;

revoke all on function public.pluvia_environment_store(text, jsonb) from public, anon, authenticated;
grant execute on function public.pluvia_environment_store(text, jsonb) to service_role;

-- Rio: a leitura da estação da própria cidade, com até 12 h. Focos: quantos (células de ~1 km) a até
-- 50 km nas últimas 24 h e a distância do mais perto; resumo com mais de 6 h vira null (indisponível,
-- nunca "nenhum foco"). Só as células de 1° vizinhas são lidas.
create or replace function public.pluvia_city_environment(p_city text, p_lat double precision, p_lon double precision)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  river jsonb;
  fires jsonb;
  snapshot record;
  spots integer;
  nearest double precision;
  cos_lat double precision;
begin
  if p_city !~ '^[0-9]{7}$' or p_lat is null or p_lon is null or p_lat not between -34 and 6 or p_lon not between -75 and -28 then
    raise exception 'invalid_request';
  end if;

  select data -> p_city into river from private.environment_snapshots where kind = 'rivers';
  if river is not null and (jsonb_typeof(river) <> 'object' or (river ->> 'at')::timestamptz < now() - interval '12 hours') then
    river := null;
  end if;

  select updated_at, data into snapshot from private.environment_snapshots where kind = 'fires';
  if found and snapshot.updated_at > now() - interval '6 hours' then
    cos_lat := cos(radians(p_lat));
    select count(*), min(d) into spots, nearest
    from (
      select 6371 * sqrt(power(radians((s ->> 0)::float8 - p_lat), 2) + power(radians((s ->> 1)::float8 - p_lon) * cos_lat, 2)) as d
      from (
        select key from generate_series(floor(p_lat - 0.5)::int, floor(p_lat + 0.5)::int) la,
          lateral generate_series(floor(p_lon - 0.6)::int, floor(p_lon + 0.6)::int) lo,
          lateral (select la || ',' || lo as key) k
      ) keys,
      lateral jsonb_array_elements(coalesce(snapshot.data -> 'cells' -> keys.key, '[]'::jsonb)) s
      where (s ->> 2)::bigint * 60 >= extract(epoch from now() - interval '24 hours')
    ) distances
    where d <= 50;
    fires := jsonb_build_object('count', spots, 'nearestKm', case when spots > 0 then round(nearest::numeric, 1) end,
      'radiusKm', 50, 'updatedAt', snapshot.updated_at);
  end if;

  return jsonb_build_object('river', river, 'fires', fires);
end;
$$;

revoke all on function public.pluvia_city_environment(text, double precision, double precision) from public;
grant execute on function public.pluvia_city_environment(text, double precision, double precision) to anon, authenticated, service_role;

-- Rios de hora em hora (a ANA publica a cada 15 min, com ~1 h de atraso); focos também de hora em hora,
-- em outro minuto (o INPE atualiza o arquivo do dia ao longo do dia).
select cron.schedule('pluvia-rivers-hourly', '10 * * * *', $job$
  select net.http_post(
    url := 'https://dszyyrcvwrpyiypwyvxe.supabase.co/functions/v1/environment-refresh',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-pluvia-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pluvia_push_cron_secret')),
    body := '{"action":"rivers"}'::jsonb, timeout_milliseconds := 120000);
$job$);

select cron.schedule('pluvia-fires-hourly', '40 * * * *', $job$
  select net.http_post(
    url := 'https://dszyyrcvwrpyiypwyvxe.supabase.co/functions/v1/environment-refresh',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-pluvia-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pluvia_push_cron_secret')),
    body := '{"action":"fires"}'::jsonb, timeout_milliseconds := 120000);
$job$);
