-- Uses a fixture only inside a rolled-back transaction; no personal data is printed.
BEGIN;
DO $$
declare owner_id uuid; original jsonb; latest jsonb;
begin
  select id into owner_id from auth.users order by id limit 1;
  if owner_id is null then raise exception 'no test subject'; end if;
  update auth.users set raw_user_meta_data='{"name":"Fixture","favorite_city_ids":["1302603"]}'::jsonb where id=owner_id;
  select raw_user_meta_data into original from auth.users where id=owner_id;
  if not public.pluvia_account_patch(owner_id,original,'{"favorite_city_ids":["1302603","3550308"]}') then raise exception 'initial patch failed'; end if;
  if public.pluvia_account_patch(owner_id,original,'{"favorite_city_ids":["4106902"]}') then raise exception 'stale overwrite allowed'; end if;
  select raw_user_meta_data into latest from auth.users where id=owner_id;
  if latest->>'name' <> 'Fixture' then raise exception 'profile field lost'; end if;
  if public.pluvia_account_patch(owner_id,latest,'{"role":"Forbidden"}') then raise exception 'non-preference field allowed'; end if;
  if not public.pluvia_account_patch(owner_id,latest,'{"primary_city_id":"4106902"}') then raise exception 'rebase failed'; end if;
  select raw_user_meta_data into latest from auth.users where id=owner_id;
  if not public.pluvia_account_patch(owner_id,latest,'{"name":"New fixture"}') then raise exception 'name patch failed'; end if;
  select raw_user_meta_data into latest from auth.users where id=owner_id;
  if latest->>'primary_city_id' <> '4106902' or jsonb_array_length(latest->'favorite_city_ids') <> 2 then raise exception 'name overwrote preferences'; end if;
  if has_function_privilege('anon','public.pluvia_account_patch(uuid,jsonb,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.pluvia_account_patch(uuid,jsonb,jsonb)','EXECUTE')
    then raise exception 'public mutation allowed'; end if;
  if not has_function_privilege('service_role','public.pluvia_account_patch(uuid,jsonb,jsonb)','EXECUTE') then raise exception 'backend grant absent'; end if;
end $$;
ROLLBACK;
