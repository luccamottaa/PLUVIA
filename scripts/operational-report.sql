-- Read-only, aggregate diagnostics. Run in Supabase SQL Editor, never in the browser.
-- No account IDs, endpoints, city keys, coordinates, messages, tokens or cron commands.
SELECT date_trunc('month',now() AT TIME ZONE 'UTC')::date AS month_utc,
 coalesce((SELECT calls FROM public.lightning_budget WHERE month_utc=date_trunc('month',now() AT TIME ZONE 'UTC')::date),0) AS reserved_requests,
 150 AS request_cap,
 10 AS provider_accesses_per_success,
 (SELECT count(*) FROM public.lightning_cache WHERE expires_at>now()) AS fresh_cache_entries;
SELECT j.jobname, r.status, r.start_time, r.end_time
FROM cron.job j LEFT JOIN LATERAL (
 SELECT status,start_time,end_time FROM cron.job_run_details WHERE jobid=j.jobid ORDER BY start_time DESC LIMIT 1
) r ON true WHERE j.jobname LIKE '%pluvia%';
SELECT status,count(*) AS deliveries FROM public.notification_deliveries
WHERE created_at>now()-interval '24 hours' GROUP BY status;
