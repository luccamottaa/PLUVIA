-- Cache partilhado e teto de chamadas Xweather, sem acesso direto do navegador.
create table if not exists public.lightning_cache (
  location_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.lightning_budget (
  month_utc date primary key,
  calls integer not null default 0 check (calls >= 0)
);

alter table public.lightning_cache enable row level security;
alter table public.lightning_budget enable row level security;
revoke all on public.lightning_cache from anon, authenticated;
revoke all on public.lightning_budget from anon, authenticated;

-- Invoker: só a chave de servidor, que já ignora RLS, executa a reserva.
create or replace function public.reserve_lightning_call(p_month date, p_limit integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_calls integer;
begin
  if p_month <> date_trunc('month', now() at time zone 'UTC')::date or
     p_limit < 1 or p_limit > 150 then
    return false;
  end if;
  insert into public.lightning_budget(month_utc, calls) values (p_month, 0)
    on conflict (month_utc) do nothing;
  update public.lightning_budget set calls = calls + 1
    where month_utc = p_month and calls < p_limit
    returning calls into current_calls;
  return current_calls is not null;
end;
$$;

revoke all on function public.reserve_lightning_call(date, integer) from public, anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update on public.lightning_cache, public.lightning_budget to service_role;
grant execute on function public.reserve_lightning_call(date, integer) to service_role;
