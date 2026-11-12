-- Avisos inteligentes (novembro/2026, pedido do dono): o push-process passa a mandar "a chuva vai engrossar"
-- (rain_worsening) e "o pior já passou" (rain_easing) pelo radar e "risco de alagamento" (flood_risk) pela chuva
-- acumulada. Ligam com as preferências existentes (rain_approaching e heavy_rain). Só amplia a lista permitida de
-- tipos de evento; publicar antes da função (sem isso o insert do evento falha e a cidade perde os avisos da rodada).
alter table public.notification_events drop constraint if exists notification_events_type;
alter table public.notification_events add constraint notification_events_type check (event_type in (
  'official_alert', 'rain_approaching', 'heavy_rain', 'storm', 'lightning', 'strong_wind', 'extreme_heat',
  'air_quality', 'weather_change', 'daily_summary', 'evening_summary', 'rain_now', 'rain_nearby', 'rain_stopped',
  'rain_incoming', 'storm_now', 'rain_worsening', 'rain_easing', 'flood_risk', 'test'
));
