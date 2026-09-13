# Notificações Web Push

O PLUVIA usa Web Push real: o navegador cria uma `PushSubscription`, o backend envia pelo serviço push do navegador com VAPID e o Service Worker apresenta a notificação do sistema. O frontend não usa `new Notification()` como atalho para o teste.

## Fluxo

1. A pessoa toca em **Ativar alertas**. A permissão nunca é solicitada na abertura da página.
2. `notifications.js` verifica suporte, iOS instalado e permissão; depois registra a subscription em `push-subscriptions`.
3. O cron executa `push-process` a cada cinco minutos.
4. A função consulta dados reais, normaliza eventos, cria um fingerprint e aplica preferências, severidade mínima e horário silencioso.
5. `notification_deliveries` impede repetir o mesmo evento para a mesma subscription.
6. `web-push` envia a mensagem. HTTP 404/410 desativa a subscription expirada.
7. O Service Worker recebe, mostra e direciona o clique para chuva, alertas, previsão ou condições atuais.

## Fontes e limites atuais

- Alertas oficiais: INMET. Só são enviados quando município/geocódigo e vigência podem ser associados à cidade monitorada.
- Chuva, tempestade, vento, calor e resumo: Open-Meteo, identificados como **modelo**, com linguagem não determinística.
- Qualidade do ar: Open-Meteo/CAMS, somente se a categoria estiver ativada e o AQI alcançar nível relevante.
- Raios e mudanças genéricas ficam visivelmente em preparação até existirem fontes/regras confiáveis. Não há ETA hiperlocal inventado.
- O processamento usa cidades escolhidas; o PLUVIA não monitora GPS em segundo plano.

## Banco e segurança

A migration `20260913134000_push_notifications.sql` cria subscriptions, preferências, locais, eventos e entregas, com RLS e índices. Uma conta aceita vários dispositivos e várias cidades. A chave VAPID privada e o segredo do cron ficam no Supabase Vault; somente o backend pode lê-los.

Segredos obrigatórios no Vault:

- `pluvia_vapid_public_key`
- `pluvia_vapid_private_key`
- `pluvia_vapid_subject`
- `pluvia_push_cron_secret`

Variáveis nativas exigidas pelas Edge Functions: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. A service-role nunca entra em `dist/`.

## Teste ponta a ponta

1. Servir por HTTPS ou localhost e entrar em uma conta PLUVIA.
2. No iPhone/iPad, usar iOS/iPadOS 16.4 ou posterior, adicionar à Tela de Início e abrir pelo ícone.
3. Abrir **Sua conta → Notificações** e tocar em **Ativar alertas**.
4. Aceitar a permissão do sistema.
5. Tocar em **Enviar notificação de teste**.
6. O sucesso na tela significa que o serviço push aceitou o envio; confirmar visualmente que o sistema exibiu a notificação e que o clique reabre/foca o PLUVIA.

Para verificar o job, consultar `cron.job_run_details`, os logs de `push-process` e as linhas de `notification_deliveries`. Não registrar endpoint completo, token, segredo ou coordenada precisa nos logs.

## Operação

- `push-subscriptions`: cadastro, remoção, preferências, cidades, dispositivos e abertura.
- `push-send`: teste Web Push autenticado, restrito à subscription do usuário.
- `push-process`: worker privado protegido por segredo do cron.
- Subscriptions desativadas são removidas após 30 dias.
- Eventos expirados e suas entregas são retidos por até 90 dias para deduplicação e diagnóstico, depois removidos em cascata.
- Alertas de severidade crítica podem atravessar o horário silencioso; permissões do sistema operacional sempre prevalecem.
