-- "Brasil agora" com o Tomorrow.io (pedido do dono, novembro/2026). O forecast-verify já consulta o Tomorrow.io
-- para as capitais em rodízio (agora 6 por hora, cada capital a cada 4 h 30); a mesma resposta guarda aqui a
-- série compacta [hora unix, temperatura, código WMO] das próximas 36 h. O app (só com "Testar Tomorrow.io"
-- ligado) lê pela RPC pública e usa o valor da hora atual. Só previsão por capital; nenhum dado de pessoa.

create table if not exists private.tomorrow_capitals (
  city_id text primary key check (city_id ~ '^[0-9]{7}$'),
  hours jsonb not null check (jsonb_typeof(hours) = 'array'),
  fetched_at timestamptz not null default now()
);
alter table private.tomorrow_capitals enable row level security;
revoke all on table private.tomorrow_capitals from public, anon, authenticated;

-- Gravação: só o forecast-verify (service_role). Lista de {city_id, hours}; entrada inválida é ignorada.
create or replace function public.pluvia_tomorrow_capitals_store(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then return 0; end if;
  insert into private.tomorrow_capitals (city_id, hours, fetched_at)
  select row_data->>'city_id', row_data->'hours', now()
  from jsonb_array_elements(p_rows) as row_data
  where coalesce(row_data->>'city_id', '') ~ '^[0-9]{7}$'
    and jsonb_typeof(row_data->'hours') = 'array'
    and jsonb_array_length(row_data->'hours') between 1 and 60
  on conflict (city_id) do update set hours = excluded.hours, fetched_at = excluded.fetched_at;
  get diagnostics stored = row_count;
  return stored;
end;
$$;
revoke all on function public.pluvia_tomorrow_capitals_store(jsonb) from public, anon, authenticated;
grant execute on function public.pluvia_tomorrow_capitals_store(jsonb) to service_role;

-- Leitura pública: {city_id: {at, hours}} só das séries de até 10 h (uma rodada atrasada ainda serve).
create or replace function public.pluvia_tomorrow_capitals()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(c.city_id, jsonb_build_object('at', extract(epoch from c.fetched_at)::bigint, 'hours', c.hours)), '{}'::jsonb)
  from private.tomorrow_capitals c
  where c.fetched_at > now() - interval '10 hours';
$$;
revoke all on function public.pluvia_tomorrow_capitals() from public;
grant execute on function public.pluvia_tomorrow_capitals() to anon, authenticated, service_role;
