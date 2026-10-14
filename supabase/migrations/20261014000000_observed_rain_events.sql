-- Avisos de chuva e trovoada observadas (outubro/2026): "Começou a chover" (estação do INMET ou boletim
-- do aeroporto), "Trovoada agora" (boletim do aeroporto) e "Chuva por perto" (chuva ou trovoada nas
-- proximidades do aeroporto). Usam as preferências existentes (rain_approaching e storms): nada muda em
-- notification_preferences, RLS ou grants; só a lista permitida de tipos de evento.
alter table public.notification_events drop constraint if exists notification_events_type;
alter table public.notification_events add constraint notification_events_type check (event_type in (
  'official_alert', 'rain_approaching', 'heavy_rain', 'storm', 'lightning', 'strong_wind', 'extreme_heat',
  'air_quality', 'weather_change', 'daily_summary', 'evening_summary', 'rain_now', 'rain_nearby', 'storm_now', 'test'
));
