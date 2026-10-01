# Disponibilidade, orçamento e verificação visual

## Monitoramento

`health.yml` agenda uma checagem pública duas vezes ao dia e permite execução manual. `scripts/check-production.cjs` consulta shell, settings públicos Auth, previsão Open-Meteo para uma referência fixa, INMET e metadata RainViewer. Tem timeout 12s por consulta e nenhum retry em loop. Falha encerra o job com código diferente de zero e diagnóstico fixo: timeout, rede, limite, provedor ou resposta inválida. Não expõe corpo/URL de erro, contas, localização de usuários, chaves privadas ou endpoints Push. Não envia notificações de teste, não chama IA/raios e não gera tráfego PostHog. Agendamento GitHub pode atrasar; não é SLA nem prova de cobertura meteorológica.

No ambiente gerenciado, Node precisa usar o proxy existente (`NODE_USE_ENV_PROXY=1`); não desabilitar TLS. A execução real validou seis fontes públicas. A falha inicial sem proxy foi de transporte do ambiente e foi corrigida pela configuração de execução, sem mudar o produto.

`scripts/operational-report.sql` é somente leitura, destinado ao SQL Editor/backend. Mostra reservas mensais de raios, limite e cache, última execução do cron e contagens de entregas nas últimas 24h. Não publicar resultado administrativo no site. Reservas não são a fatura do Xweather: uma chamada de raios bem-sucedida custa ×10 acessos, enquanto reservas de falhas também podem consumir o teto conservador do Pluvia. Em 01/10, havia 3 reservas de 150 e a última execução do cron estava succeeded. Isso não comprova entrega visível de notificações; accepted significa aceitação pelo serviço Push.

O PostHog existente continua opcional e sem identidade/GPS. Painel de falhas e eventos: https://us.posthog.com/project/602240/dashboard/2158406 . Não houve adição de SDK, autocapture, replay ou collector paralelo. O limite por visita existe; orçamento global/retention e notificações de billing dependem das configurações administrativas do provedor e ainda merecem acompanhamento. Não ampliar coleta para calcular localização/perfil de usuários.

## Interface automatizada

`visual.yml` executa Chromium/WebKit com Python Playwright 1.62.0 isolado da aplicação. Roda os testes de navegação/layout, sync de conta, ciclo da conta e `verify-visual.py`. Auth/Push/clima externos são interceptados. Os testes visuais usam data fixa, dispositivo em Asia/Tokyo, cidade brasileira e screenshots com movimento reduzido. Verificam estado do céu, geometria, conteúdo principal, overflow, alertas nos favoritos, loading, stale, erro e animação dos diálogos. Screenshots ficam como artifacts por sete dias.

São contratos de layout/estado com screenshots para revisão; **não é comparação pixel a pixel com baseline aprovado**. Essa abordagem captura regressões graves sem confundir diferenças de sistema/fontes com bugs. Baselines de pixels devem ser acrescentadas em um ambiente de imagem/browser fixo, com atualização explícita e revisão visual. Não autoaprovar screenshot nova quando teste falhar.

## Deslizamento dos painéis

A abertura vem de cima para baixo em 400 ms. X, Escape e backdrop saem para baixo em 280 ms, conservando o diálogo nativo aberto e o foco até terminar. O controlador compartilhado lê posição/opacidade uma única vez, suporta fechar durante a entrada e evita saídas duplicadas. Fechamento programático por troca de cidade/dados continua imediato e cancela qualquer saída pendente; movimento reduzido fecha imediatamente. Entrada e saída usam animações CSS, incluindo no Safari. Há limite de 500 ms para não prender o modal se faltarem frames. Não há novo timer contínuo, blur, dependência ou alteração do layout.

Os testes de `dialog-motion.test.cjs` cobrem esses contratos e `verify-visual.py` verifica o sentido real do movimento, backdrop, foco, fechamento/reabertura e reduced motion em mobile/desktop. Amostragem do movimento usa o frame do navegador; atraso de um renderer em CI não deve ser interpretado como inversão da animação.

## iPhone físico: verificação ainda pendente

WebKit automatizado não prova instalação/entrega Push em iOS real. Usar um iPhone disponível, sem precisar modelo específico:

- Safari e PWA instalada: abrir Conta, busca, detalhes e radar, em retrato/paisagem; verificar safe areas e barras dinâmicas.
- Focar e-mail, senha e nome; teclado deve manter campo e ação visíveis, com apenas a superfície do diálogo rolando.
- Ativar movimento reduzido em Acessibilidade: menus e detalhes abrem sem animação; informações meteorológicas continuam.
- Após configurar Google/Apple, concluir consentimento e cancelar em ambos, inclusive retorno entre Safari e standalone. Não assumir compartilhamento de sessão entre contextos.
- Confirmar cadastro/recuperação na caixa controlada; testar link vencido, abertura em outro dispositivo e senha nova. Não usar contas reais de terceiros.
- Ativar Push somente na PWA e com gesto do usuário; testar permissão negada, background e retorno. Diagnosticar “aceito” versus mensagem entregue.
- Abrir offline após uso, conferir idade da previsão, reconectar e verificar revalidação silenciosa e atualização do SW sem perder texto digitado.

Não declarar essa lista concluída sem executar em hardware. Não instalamos apps de terceiros, compramos aparelhos ou contratamos dispositivo remoto nesta etapa.
