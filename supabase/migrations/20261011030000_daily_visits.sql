-- Contador anônimo de aparelhos por dia. Cada aparelho soma +1 uma vez por dia (o próprio
-- aparelho lembra a data). A tabela guarda só o dia (horário de Brasília) e o total: nenhum
-- identificador, IP, cidade ou conta. O navegador só chega aqui pela função abaixo.
create table if not exists public.daily_visits (
  day date primary key,
  visits integer not null default 0 check (visits >= 0)
);

alter table public.daily_visits enable row level security;
revoke all on public.daily_visits from anon, authenticated;

create or replace function public.pluvia_count_visit()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.daily_visits (day, visits)
  values ((now() at time zone 'America/Sao_Paulo')::date, 1)
  on conflict (day) do update set visits = public.daily_visits.visits + 1;
$$;

revoke all on function public.pluvia_count_visit() from public;
grant execute on function public.pluvia_count_visit() to anon, authenticated;
