-- Explicit deny policies document that these two tables are backend-only and
-- keep the database linter from treating policy-free RLS as accidental.

create policy smart_summary_cache_backend_only
on public.smart_summary_cache
for all
to anon, authenticated
using (false)
with check (false);

create policy smart_summary_quota_backend_only
on public.smart_summary_quota
for all
to anon, authenticated
using (false)
with check (false);

