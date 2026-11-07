create table if not exists public.daily_visit_devices (
  day date not null,
  device_hash text not null check (length(device_hash) = 64),
  created_at timestamptz not null default now(),
  primary key (day, device_hash)
);
alter table public.daily_visit_devices enable row level security;
revoke all on public.daily_visit_devices from anon, authenticated, public;
revoke execute on function public.pluvia_count_visit() from anon, authenticated, public;
drop function public.pluvia_count_visit();

create or replace function public.pluvia_count_visit(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  visit_day date := (now() at time zone 'America/Sao_Paulo')::date;
  inserted integer;
  hashed text;
begin
  if p_device_id is null then
    return false;
  end if;

  hashed := encode(extensions.digest('pluvia-visit:' || p_device_id::text, 'sha256'), 'hex');

  delete from public.daily_visit_devices
  where day < visit_day - 2;

  insert into public.daily_visit_devices(day, device_hash)
  values (visit_day, hashed)
  on conflict (day, device_hash) do nothing;

  get diagnostics inserted = row_count;
  if inserted = 0 then
    return false;
  end if;

  insert into public.daily_visits(day, visits)
  values (visit_day, 1)
  on conflict (day) do update
    set visits = public.daily_visits.visits + 1;

  return true;
end;
$function$;

revoke all on function public.pluvia_count_visit(uuid) from public;
grant execute on function public.pluvia_count_visit(uuid) to anon, authenticated, service_role;
