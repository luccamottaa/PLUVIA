create or replace function public.pluvia_rain_report(p_city text, p_kind text, p_device text)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  device text;
begin
  if p_city is null or p_city !~ '^[0-9]{7}$' or p_kind is null or p_kind not in ('dry', 'drizzle', 'rain', 'heavy')
     or p_device is null or p_device !~ '^[0-9a-f-]{32,36}$' then
    return 'invalid';
  end if;

  device := encode(extensions.digest('pluvia-rain:' || p_device, 'sha256'), 'hex');

  -- Serialize submissions from the same device and within the same city.
  -- This closes the race between the duplicate/city-limit checks and the insert.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(device, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pluvia-rain-city:' || p_city, 0));

  delete from public.rain_reports where created_at < now() - interval '2 days';

  if exists (
    select 1 from public.rain_reports
    where device_hash = device and created_at > now() - interval '15 minutes'
  ) then
    return 'duplicate';
  end if;

  if (
    select count(*) from public.rain_reports
    where city_id = p_city and created_at > now() - interval '10 minutes'
  ) >= 60 then
    return 'busy';
  end if;

  insert into public.rain_reports (city_id, kind, device_hash)
  values (p_city, p_kind, device);

  return 'ok';
end;
$function$;
