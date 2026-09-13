-- Execution privilege is the authorization boundary here. Edge Functions use
-- service_role, while public/anon/authenticated remain explicitly revoked.
create or replace function public.pluvia_push_secret_bundle()
returns table (vapid_public_key text, vapid_private_key text, vapid_subject text, cron_secret text)
language sql
security definer
set search_path = ''
as $$
  select
    max(decrypted_secret) filter (where name = 'pluvia_vapid_public_key'),
    max(decrypted_secret) filter (where name = 'pluvia_vapid_private_key'),
    max(decrypted_secret) filter (where name = 'pluvia_vapid_subject'),
    max(decrypted_secret) filter (where name = 'pluvia_push_cron_secret')
  from vault.decrypted_secrets
  where name in ('pluvia_vapid_public_key', 'pluvia_vapid_private_key', 'pluvia_vapid_subject', 'pluvia_push_cron_secret');
$$;

revoke all on function public.pluvia_push_secret_bundle() from public, anon, authenticated;
grant execute on function public.pluvia_push_secret_bundle() to service_role;
