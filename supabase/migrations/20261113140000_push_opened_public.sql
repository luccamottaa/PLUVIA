-- Abertura das notificações registrada pelo próprio service worker (1.74.1). Desde a 1.66 a página registrava a
-- abertura depois de carregar, ler a sessão e chamar push-subscriptions; de 09 a 13/11/2026 foram 130 avisos
-- entregues e 1 abertura registrada, sem como saber se ninguém tocava ou se o caminho falhava no iPhone.
-- Aqui basta o id da entrega (UUID aleatório, impossível de adivinhar, que só existe na notificação daquele
-- aparelho): marca o horário da primeira abertura, nada mais. Não devolve nem recebe dado pessoal.
create or replace function public.pluvia_push_opened(p_delivery uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_deliveries
     set opened_at = now()
   where id = p_delivery
     and opened_at is null
     and status in ('accepted', 'pending')
     and created_at > now() - interval '7 days';
$$;

revoke all on function public.pluvia_push_opened(uuid) from public;
grant execute on function public.pluvia_push_opened(uuid) to anon, authenticated;
