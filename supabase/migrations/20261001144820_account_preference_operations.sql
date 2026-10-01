-- Auth remains the existing preference store; no personal lists are migrated.
-- Only a verified Edge Function can perform the conditional, bounded patch.
create function public.pluvia_account_patch(p_user_id uuid, p_expected jsonb, p_patch jsonb)
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
        where key not in ('favorite_city_ids','primary_city_id','named_places_v1','name')
      )
    returning 1
  ) select exists(select 1 from changed);
$$;
revoke all on function public.pluvia_account_patch(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.pluvia_account_patch(uuid,jsonb,jsonb) to service_role;
