-- Foto de perfil sincronizada: avatar_id (um dos desenhos de dist/modules/avatars.js, ou null) entra na
-- allowlist do patch atômico das preferências. O resto da função não muda: comparação do JSON esperado,
-- search_path vazio e execução só para service_role.
create or replace function public.pluvia_account_patch(p_user_id uuid, p_expected jsonb, p_patch jsonb)
returns boolean
language sql security definer set search_path = ''
as $$
  with changed as (
    update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || p_patch,
        updated_at = now()
    where id = p_user_id
      and coalesce(raw_user_meta_data, '{}'::jsonb) = p_expected
      and jsonb_typeof(p_patch) = 'object'
      and not exists (
        select 1 from jsonb_object_keys(p_patch) as keys(key)
        where key not in ('favorite_city_ids','primary_city_id','named_places_v1','name','avatar_id')
      )
    returning 1
  ) select exists(select 1 from changed);
$$;
revoke all on function public.pluvia_account_patch(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.pluvia_account_patch(uuid,jsonb,jsonb) to service_role;
