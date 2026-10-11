-- "Tá chovendo aí?": relatos de quem está na cidade, sem conta, sem localização e por pouco tempo.
-- Guardamos só a cidade (código IBGE), a resposta, o horário e um hash do identificador aleatório do
-- aparelho (para um relato por aparelho a cada 15 minutos). Linhas com mais de 2 dias são apagadas
-- pela própria inserção. O navegador só chega aqui pelas duas funções abaixo; a tabela fica fechada.
create table if not exists public.rain_reports (
  id bigint generated always as identity primary key,
  city_id text not null check (city_id ~ '^[0-9]{7}$'),
  kind text not null check (kind in ('dry', 'drizzle', 'rain', 'heavy')),
  device_hash text not null check (length(device_hash) = 64),
  created_at timestamptz not null default now()
);

create index if not exists rain_reports_city_time on public.rain_reports (city_id, created_at desc);
create index if not exists rain_reports_device_time on public.rain_reports (device_hash, created_at desc);
create index if not exists rain_reports_time on public.rain_reports (created_at);

alter table public.rain_reports enable row level security;
revoke all on public.rain_reports from anon, authenticated;

-- Grava um relato. Devolve 'ok', 'duplicate' (mesmo aparelho há menos de 15 min), 'busy' (cidade com
-- relatos demais em 10 min, teto contra spam) ou 'invalid'.
create or replace function public.pluvia_rain_report(p_city text, p_kind text, p_device text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  device text;
begin
  if p_city is null or p_city !~ '^[0-9]{7}$' or p_kind is null or p_kind not in ('dry', 'drizzle', 'rain', 'heavy')
     or p_device is null or p_device !~ '^[0-9a-f-]{32,36}$' then
    return 'invalid';
  end if;
  device := encode(extensions.digest('pluvia-rain:' || p_device, 'sha256'), 'hex');
  delete from public.rain_reports where created_at < now() - interval '2 days';
  if exists (select 1 from public.rain_reports where device_hash = device and created_at > now() - interval '15 minutes') then
    return 'duplicate';
  end if;
  if (select count(*) from public.rain_reports where city_id = p_city and created_at > now() - interval '10 minutes') >= 60 then
    return 'busy';
  end if;
  insert into public.rain_reports (city_id, kind, device_hash) values (p_city, p_kind, device);
  return 'ok';
end;
$$;

-- Resumo da última hora numa cidade: contagem por resposta e o relato mais recente. Nunca devolve
-- linhas individuais nem o hash do aparelho.
create or replace function public.pluvia_rain_reports(p_city text)
returns table (dry integer, drizzle integer, rain integer, heavy integer, latest timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (where kind = 'dry')::integer,
    count(*) filter (where kind = 'drizzle')::integer,
    count(*) filter (where kind = 'rain')::integer,
    count(*) filter (where kind = 'heavy')::integer,
    max(created_at)
  from public.rain_reports
  where p_city ~ '^[0-9]{7}$' and city_id = p_city and created_at > now() - interval '60 minutes';
$$;

revoke all on function public.pluvia_rain_report(text, text, text) from public;
revoke all on function public.pluvia_rain_reports(text) from public;
grant execute on function public.pluvia_rain_report(text, text, text) to anon, authenticated;
grant execute on function public.pluvia_rain_reports(text) to anon, authenticated;
