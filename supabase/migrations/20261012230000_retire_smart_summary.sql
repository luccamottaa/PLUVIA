-- O Resumo Inteligente foi aposentado em outubro/2026 (a função smart-summary já foi apagada).
-- Sobravam a cache vazia e a tabela de cota (ids de usuário e contagens por janela) sem nenhum uso.
-- Apagar tira dado pessoal guardado sem motivo e o índice que o linter marcava como não usado.
drop function if exists public.pluvia_take_summary_quota(uuid, smallint);
drop table if exists public.smart_summary_quota;
drop table if exists public.smart_summary_cache;
