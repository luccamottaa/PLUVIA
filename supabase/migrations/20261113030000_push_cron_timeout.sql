-- Robô de avisos com mais tempo de espera (13/11/2026, pedido do dono). Desde os avisos inteligentes (radar também
-- com chuva agora) a rodada do push-process leva ~40 s, e o cron só esperava 25 s pela resposta: os avisos saíam,
-- mas net._http_response registrava "Timeout of 25000 ms" em vez do resultado da rodada. A função tem prazo
-- interno de 90 s; o cron passa a esperar 120 s. Só muda o tempo de espera; o resto do comando é o mesmo.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'pluvia-push-weather-every-5-minutes'),
  command := $job$
    select net.http_post(
      url := 'https://dszyyrcvwrpyiypwyvxe.supabase.co/functions/v1/push-process',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pluvia-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pluvia_push_cron_secret')
      ),
      body := '{"action":"process"}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
