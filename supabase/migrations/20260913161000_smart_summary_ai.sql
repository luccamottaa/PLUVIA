-- Server-only cache and per-user quota for the optional Smart Summary AI pass.

create table public.smart_summary_cache (
  context_hash text primary key,
  city_id text not null,
  summary jsonb not null,
  provider text not null,
  model text not null,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint smart_summary_cache_hash check (context_hash ~ '^[a-f0-9]{64}$'),
  constraint smart_summary_cache_city check (city_id ~ '^\d{7}$'),
  constraint smart_summary_cache_provider check (length(provider) between 2 and 40),
  constraint smart_summary_cache_model check (length(model) between 1 and 100),
  constraint smart_summary_cache_summary check (jsonb_typeof(summary) = 'object'),
  constraint smart_summary_cache_expiry check (expires_at > generated_at)
);

create index smart_summary_cache_expiry_idx on public.smart_summary_cache (expires_at);

create table public.smart_summary_quota (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  requests smallint not null default 1,
  primary key (user_id, window_started_at),
  constraint smart_summary_quota_requests check (requests between 1 and 60)
);

create index smart_summary_quota_window_idx on public.smart_summary_quota (window_started_at);

alter table public.smart_summary_cache enable row level security;
alter table public.smart_summary_quota enable row level security;

revoke all on public.smart_summary_cache, public.smart_summary_quota from public, anon, authenticated;
grant all on public.smart_summary_cache, public.smart_summary_quota to service_role;

create or replace function public.pluvia_take_summary_quota(p_user_id uuid, p_limit smallint default 12)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  bucket timestamptz := date_trunc('hour', now());
  next_count smallint;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise insufficient_privilege using message = 'backend only';
  end if;
  if p_user_id is null or p_limit < 1 or p_limit > 60 then
    return false;
  end if;

  insert into public.smart_summary_quota (user_id, window_started_at, requests)
  values (p_user_id, bucket, 1)
  on conflict (user_id, window_started_at) do update
    set requests = public.smart_summary_quota.requests + 1
    where public.smart_summary_quota.requests < p_limit
  returning requests into next_count;

  return next_count is not null and next_count <= p_limit;
end;
$$;

revoke all on function public.pluvia_take_summary_quota(uuid, smallint) from public, anon, authenticated;
grant execute on function public.pluvia_take_summary_quota(uuid, smallint) to service_role;

