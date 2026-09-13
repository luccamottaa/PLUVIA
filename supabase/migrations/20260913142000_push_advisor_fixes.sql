-- Make the intentional backend-only event table explicit to the linter and
-- cover the delivery foreign key used when subscriptions are deleted.
create policy notification_events_backend_only on public.notification_events
for all to authenticated using (false) with check (false);

create index notification_deliveries_subscription_idx
on public.notification_deliveries (subscription_id);
