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
  where day < visit_day;

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

select cron.schedule(
  'pluvia-visit-device-prune-hourly',
  '0 * * * *',
  $job$delete from public.daily_visit_devices where day < (now() at time zone 'America/Sao_Paulo')::date;$job$
);
