-- Backend-only state. No user preferences or subscription data is migrated.
create table private.push_worker_state (
  singleton boolean primary key default true check (singleton),
  cursor_id uuid,
  lease_token uuid,
  lease_until timestamptz not null default '-infinity'
);
alter table private.push_worker_state enable row level security;
revoke all on private.push_worker_state from public, anon, authenticated;
insert into private.push_worker_state(singleton) values (true);

-- Atomic UPDATE serializes overlapping cron invocations; a crashed worker's
-- lease expires after the Free plan's maximum execution lifetime (150s).
create function public.pluvia_push_claim(p_token uuid)
returns table(cursor_id uuid)
language sql security definer set search_path = ''
as $$
  update private.push_worker_state as state
  set lease_token = p_token, lease_until = clock_timestamp() + interval '3 minutes'
  where singleton and p_token is not null and lease_until <= clock_timestamp()
  returning state.cursor_id;
$$;

create function public.pluvia_push_checkpoint(p_token uuid, p_cursor uuid, p_release boolean default false)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare touched integer;
begin
  update private.push_worker_state
  set cursor_id = p_cursor,
      lease_token = case when p_release then null else lease_token end,
      lease_until = case when p_release then '-infinity'::timestamptz else lease_until end
  where singleton and lease_token = p_token and lease_until > clock_timestamp();
  get diagnostics touched = row_count;
  return touched = 1;
end;
$$;

revoke all on function public.pluvia_push_claim(uuid) from public, anon, authenticated;
revoke all on function public.pluvia_push_checkpoint(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.pluvia_push_claim(uuid) to service_role;
grant execute on function public.pluvia_push_checkpoint(uuid, uuid, boolean) to service_role;
