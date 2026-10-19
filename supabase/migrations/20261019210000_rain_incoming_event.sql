-- "Chuva chegando" pelo radar (outubro/2026, pedido do dono): o push-process extrapola o movimento das
-- manchas do RainViewer (o mesmo cálculo do app) e avisa com 10 a 60 min de antecedência. Liga com a
-- preferência existente rain_approaching. Só amplia a lista permitida de tipos de evento.
alter table public.notification_events drop constraint if exists notification_events_type;
alter table public.notification_events add constraint notification_events_type check (event_type in (
  'official_alert', 'rain_approaching', 'heavy_rain', 'storm', 'lightning', 'strong_wind', 'extreme_heat',
  'air_quality', 'weather_change', 'daily_summary', 'evening_summary', 'rain_now', 'rain_nearby', 'rain_stopped',
  'rain_incoming', 'storm_now', 'test'
));
