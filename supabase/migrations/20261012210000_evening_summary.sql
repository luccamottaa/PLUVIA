-- Resumo da noite: a previsão de amanhã (máxima, mínima e chuva) no horário escolhido, 20:00 por padrão.
-- Começa desligado para todos; quem quiser liga em Minha conta. O tipo de evento entra na lista
-- permitida de notification_events. Nada muda nas políticas de RLS nem nos grants.
alter table public.notification_preferences
  add column if not exists evening_summary boolean not null default false,
  add column if not exists evening_summary_time time not null default '20:00';

alter table public.notification_events drop constraint if exists notification_events_type;
alter table public.notification_events add constraint notification_events_type check (event_type in (
  'official_alert', 'rain_approaching', 'heavy_rain', 'storm', 'lightning', 'strong_wind', 'extreme_heat',
  'air_quality', 'weather_change', 'daily_summary', 'evening_summary', 'test'
));
