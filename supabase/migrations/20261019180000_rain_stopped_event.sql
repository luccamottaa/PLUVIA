-- "Parou de chover" (outubro/2026): a estação do INMET não registrou chuva na hora que acabou de fechar depois
-- de uma hora com chuva, ou o aeroporto deixou de relatar chuva. Liga com a preferência existente
-- rain_approaching e só é entregue a quem recebeu "começou a chover"/"trovoada agora" da cidade nas últimas
-- 6 horas (push-process). Nada muda em preferências, RLS ou grants; só a lista permitida de tipos.
alter table public.notification_events drop constraint if exists notification_events_type;
alter table public.notification_events add constraint notification_events_type check (event_type in (
  'official_alert', 'rain_approaching', 'heavy_rain', 'storm', 'lightning', 'strong_wind', 'extreme_heat',
  'air_quality', 'weather_change', 'daily_summary', 'evening_summary', 'rain_now', 'rain_nearby', 'rain_stopped',
  'storm_now', 'test'
));
