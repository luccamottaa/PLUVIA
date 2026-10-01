BEGIN;
-- Locks only backend scheduler state briefly; rollback preserves the live cursor/lease.
UPDATE private.push_worker_state SET lease_until = '-infinity';
DO $$ declare first_token uuid := gen_random_uuid(); second_token uuid := gen_random_uuid(); progress uuid := gen_random_uuid(); held integer; begin
select count(*) into held from public.pluvia_push_claim(first_token);
if held <> 1 then raise exception 'initial claim failed'; end if;
select count(*) into held from public.pluvia_push_claim(second_token);
if held <> 0 then raise exception 'overlap allowed'; end if;
if public.pluvia_push_checkpoint(second_token, progress) then raise exception 'foreign checkpoint allowed'; end if;
if not public.pluvia_push_checkpoint(first_token, progress) then raise exception 'checkpoint failed'; end if;
if not public.pluvia_push_checkpoint(first_token, progress, true) then raise exception 'release failed'; end if;
if (select cursor_id from public.pluvia_push_claim(second_token)) is distinct from progress then raise exception 'progress lost'; end if;
update private.push_worker_state set lease_until=now()-interval '1 minute';
if public.pluvia_push_checkpoint(second_token,null) then raise exception 'expired lease allowed'; end if;
select count(*) into held from public.pluvia_push_claim(first_token);
if held <> 1 then raise exception 'crash recovery failed'; end if;
if has_function_privilege('anon','public.pluvia_push_claim(uuid)','EXECUTE') or has_function_privilege('authenticated','public.pluvia_push_checkpoint(uuid,uuid,boolean)','EXECUTE') then raise exception 'public access allowed'; end if;
if not has_function_privilege('service_role','public.pluvia_push_claim(uuid)','EXECUTE') then raise exception 'backend access missing'; end if;
end $$;
ROLLBACK;
