-- Escolher os avisos novos (13/11/2026, pedido do dono: "faz todos", item 2). Até aqui "risco de alagamento" ligava
-- junto com "chuva forte" e "o pior já passou" junto com "chuva se aproximando", e o limite diário de avisos fracos
-- era fixo em 4. Agora cada um tem a própria preferência; os padrões repetem o comportamento de antes. 0 no limite
-- = sem limite. As permissões da tabela (nível de tabela) já cobrem as colunas novas.
alter table public.notification_preferences
  add column if not exists flood_risk boolean not null default true,
  add column if not exists rain_easing boolean not null default true,
  add column if not exists low_daily_cap smallint not null default 4;
alter table public.notification_preferences drop constraint if exists notification_preferences_low_daily_cap;
alter table public.notification_preferences add constraint notification_preferences_low_daily_cap check (low_daily_cap between 0 and 20);
