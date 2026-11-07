revoke all on table
  public.notification_deliveries,
  public.notification_locations,
  public.notification_preferences,
  public.push_subscriptions
from authenticated;

grant select on table public.notification_deliveries to authenticated;
grant select, insert, update, delete on table public.notification_locations to authenticated;
grant select, insert, update on table public.notification_preferences to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
