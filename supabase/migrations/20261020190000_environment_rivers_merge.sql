-- Rios: uma estação da ANA que falha (429 é comum) não apaga a leitura anterior da cidade. O resumo novo é
-- mesclado sobre o anterior; entradas velhas continuam filtradas pelo limite de 12 h de pluvia_city_environment.
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
  on conflict (kind) do update set updated_at = excluded.updated_at,
    data = case when excluded.kind = 'rivers' then private.environment_snapshots.data || excluded.data else excluded.data end;
end;
$$;

revoke all on function public.pluvia_environment_store(text, jsonb) from public, anon, authenticated;
grant execute on function public.pluvia_environment_store(text, jsonb) to service_role;
