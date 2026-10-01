# Confiabilidade das notificações — etapa de 1 de outubro de 2026

## Estado auditado

Já existiam Web Push/VAPID real, opt-in, vários dispositivos e municípios, preferências com RLS, cron a cada cinco minutos, INMET municipal, modelos Open-Meteo/CAMS e deduplicação de eventos/entregas. Não foram recriados. Foram conferidos o worker, serviços compartilhados, migrations, consumidores da conta, testes e fontes publicadas. Os seis arquivos da função remota coincidiam com a árvore de `main` antes das mudanças.

O worker consultava sempre os primeiros 100 locais sem cursor nem ordenação, repetia consultas meteorológicas iguais e ignorava erros ao carregar preferências/dispositivos. Na auditoria havia cinco locais ativos: o limite era um defeito confirmado de escalabilidade, sem evidência de que usuários atuais já estivessem sendo excluídos.

`Number(null)` e defaults `|| 0` podiam transformar temperatura ausente em mudança térmica, ausência de precipitação/rajadas em condição tranquila e sensação ausente em 0 °C. Máximos independentes de quantidade/probabilidade podiam gerar chuva forte a partir de horas diferentes. O horizonte era contado por posições do array; o resumo usava sempre o primeiro dia. Esses problemas foram reproduzidos com fixtures; não há alegação de notificações incorretas efetivamente recebidas em produção.

## Mudanças e contratos

- Validação estrita por campo, códigos WMO conhecidos, timestamps atuais e horizonte real de três/seis horas. Ausência de um campo bloqueia somente as regras que precisam dele. Temperatura pode explicar calor quando sensação não estiver disponível.
- Precipitação continua representando a hora que termina no timestamp. Quantidade e probabilidade devem pertencer à mesma hora; lacunas, duplicatas ou ordem inválida não estabelecem intervalos fictícios. A janela informada continua aproximada e identifica o modelo.
- AQI exige timestamp válido e valor numérico; concentrações ausentes permanecem null. Resumo exige extremos/probabilidade válidos e identifica o dia da cidade pelos timestamps.
- Cursor por UUID, lote de até 100 locais, lease atômica de três minutos e orçamento de 90 segundos para começar trabalho. A rodada seguinte continua depois do cursor e volta ao início ao alcançar o fim; inserções antes do cursor entram na próxima volta. Um local interrompido por orçamento não é saltado. Tentativas concluídas com fonte indisponível avançam para não bloquear os demais.
- Requests administrativos do worker têm timeout de oito segundos; fontes mantêm timeout de 12 segundos e envios, 12 segundos. A operação iniciada pode terminar após o orçamento. Checkpoints e release falhos são diagnosticados; a lease expira após crash.
- Consultas iguais compartilham resultado/falha dentro da execução, sem cache duradouro. Categorias desativadas não exigem consulta da previsão; INMET só é consultado se necessário. Falha meteorológica preserva processamento independente de avisos oficiais.
- Preferências/dispositivos com erro interrompem a rodada sem avançar o cursor. Diagnóstico separa rede, timeout, HTTP, JSON inválido e timestamp inválido; nenhum segredo, endpoint ou coordenada precisa é acrescentado aos logs.

A migration adiciona apenas estado interno e dois RPCs restritos a `service_role`. Não migra dados de contas, muda consentimento nem recria inscrições. RLS permanece nas tabelas existentes. Os RPCs precisam de `SECURITY DEFINER` para alcançar o schema privado; `search_path` vazio e revogação de execução pública fazem parte do contrato.

## Verificação

Foram adicionados 12 testes comportamentais em `tests/push-worker.test.cjs`: dados ausentes/inválidos, chuva com probabilidade de outra hora, gaps/ordem, meia-noite municipal, calor sem sensação, freshness/AQI, dia do resumo, 205 locais, deduplicação de consultas, sobreposição, erro de conta, timeout de orçamento, checkpoint falho, alertas oficiais com fonte indisponível e contagem de envio parcial. O teste de integração já existente foi adaptado ao protocolo de lease.

- Suíte Node: 62 arquivos passam; execução sem isolamento apresenta 224 entradas, zero falhas/skips (há arquivos com assertions diretas, portanto não são 224 casos individuais novos).
- Sintaxe dos 35 JS/CJS publicados e typecheck Deno das seis funções passam.
- SQL da migration e invariantes de claim/checkpoint/release/expiração/permissões executados em transação revertida. `scripts/verify-push-scheduler.sql` permite repetir a verificação sem enviar push e preservando estado com rollback.
- Uma consulta real Open-Meteo confirmou timestamps Unix de meia-noite municipal: Manaus retorna 04:00 UTC para 00:00 local. Isso não comprova entrega push.
- WebKit automatizado passou em sete viewports (320 a 2560 px), sete estados visuais, detalhes, favoritos, compartilhamento, stale e troca de cidade offline, sem overflow nem erros de JavaScript. Usa fixtures e não substitui Safari em iPhone físico.
- Não há lint, typecheck frontend ou build de compilação configurados; o deploy publica arquivos estáticos de `dist/`. Nenhum arquivo visual ou asset do frontend foi modificado nesta etapa.

Publicação: CI deve passar antes do merge; aplicar migration antes de publicar `push-process`, preservando `verify_jwt=false` e autenticação pelo segredo do cron. Testes HTTP de OPTIONS/401 não disparam notificações. Entrega real e iPhone físico continuam exigindo teste voluntário no aparelho.

## Limites e próxima etapa

Lotes justos eliminam a exclusão permanente após o centésimo local, mas não garantem latência constante com milhares de locais. O resumo diário ainda usa a janela existente de ±4 minutos; filas maiores podem perder essa janela. Antes de escalar, medir tempo/rodadas e avaliar prioridade para resumos agendados, concorrência limitada e fila de entregas com retry de falhas transitórias. Não foi criada recursão ilimitada de Edge Functions.

Falhas finais de entrega ainda não têm uma fila de retry dedicada. Fingerprints e constraints existentes evitam duplicação, mas uma tentativa que falha não é garantia de entrega futura. Esta etapa não altera silenciosamente a política de reenvio.

A sincronização de favoritos/locais continua em `user_metadata`, com merge e tombstones já existentes. Uma escrita simultânea entre dispositivos pode sobrescrever dados; migrar para operações atômicas com RLS, versionamento e compatibilidade de clientes é uma etapa própria. Não alegar que read-merge-write oferece atomicidade.

Após aplicar a migration, o Security Advisor mantém o aviso de proteção contra senhas vazadas desativada e três informações sobre tabelas internas sem policies: as duas tabelas de raios existentes e o novo estado privado do worker. O estado do worker é acessado somente pelos RPCs restritos; ausência de policy pública é intencional. A documentação atual limita a proteção nativa de senhas ao plano Pro ou superior; nenhum upgrade/custo foi contratado. Não liberar tabelas internas para remover avisos.

Nowcast com ETA em minutos e raios observados continuam dependentes de cobertura/fonte/licença apropriadas; previsão horária e animação estética não fornecem essa precisão.
