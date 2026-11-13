-- "Minha localização" (1.74, pedido do dono): com a opção "Usar minha localização exata" e os avisos ligados,
-- o aparelho guarda um ponto arredondado (~1 km, duas casas decimais) como mais um lugar de aviso, ao lado
-- das cidades salvas. O ponto e a cidade dele podem ser o mesmo município, por isso a chave única passa a
-- incluir o tipo do lugar. No máximo um ponto por usuário; desligar a opção apaga a linha.
--
-- Ordem: esta migration ANTES de publicar push-subscriptions/push-process novos. A função nova tenta a
-- chave (user_id, city_id, kind) e, sem ela (função antes da migration), volta a (user_id, city_id).

alter table public.notification_locations
  add column if not exists kind text not null default 'city';

alter table public.notification_locations
  drop constraint if exists notification_locations_kind;
alter table public.notification_locations
  add constraint notification_locations_kind check (kind in ('city', 'point'));

-- O ponto só guarda duas casas decimais (~1,1 km): o servidor nunca recebe a posição exata.
alter table public.notification_locations
  drop constraint if exists notification_locations_point_rounded;
alter table public.notification_locations
  add constraint notification_locations_point_rounded check (
    kind <> 'point' or (round(latitude::numeric, 2) = latitude::numeric and round(longitude::numeric, 2) = longitude::numeric)
  );

alter table public.notification_locations
  drop constraint if exists notification_locations_user_id_city_id_key;
alter table public.notification_locations
  drop constraint if exists notification_locations_user_city_kind_key;
alter table public.notification_locations
  add constraint notification_locations_user_city_kind_key unique (user_id, city_id, kind);

create unique index if not exists notification_locations_one_point_idx
  on public.notification_locations (user_id) where kind = 'point';
