# Trabalhar no PLUVIA

## Produto e arquitetura reais

O PLUVIA é um painel meteorológico brasileiro estático. `dist/` é código-fonte publicado, não uma pasta descartável de build. Não há React, bundler, hooks de framework, compilação frontend ou dependências npm a instalar na raiz. Preserve a identidade visual, o painel público, os favoritos, as cidades salvas, os avisos oficiais e o PWA. Mudanças visuais precisam resolver um problema concreto.

Leia os arquivos envolvidos e seus consumidores antes de editar. O estado e a ordem dos scripts são parte do contrato: os scripts clássicos compartilham declarações lexicais (`activeCity`, `cityRevision`, `displayedWeather`, `favorites`, `cityById`) e os módulos expõem APIs em `globalThis.PLUVIA`. Muitos módulos puros também oferecem CommonJS para testes. Não transforme scripts em ES modules sem mapear essa integração.

## Onde cada responsabilidade vive

- `dist/index.html`: DOM, SVG compartilhado, abertura e ordem de carregamento.
- `dist/app.js`: escolha de cidade, revisões de consultas, atualização, cache meteorológico e renderização dos cards.
- `dist/p0.js`: abertura pública, fallback de localização, integração da busca/favoritos, atualização do SW e viewport dos diálogos. Há extensões de funções de `app.js`; confira ambos.
- `dist/capitals.js`: capitais, busca, normalização dos nomes e carregadores municipais. `municipality-index.js` é leve; `cities/<uf>.js` traz detalhes sob demanda; `municipalities.js` completo é reservado ao GPS. O catálogo contém 5.571 municípios. Regenere índices com `node scripts/chunk-municipalities.cjs` quando mudar o catálogo.
- `dist/modules/http-client.js`: timeout, cancelamento, classificação de erros e limpeza de controllers.
- `dist/modules/weather-services.js`: URLs e consultas Open-Meteo, CAMS, INMET, MET Norway e ensemble. Deduplica consultas simultâneas idênticas; sinais externos mantêm cancelamento independente. Cada cliente mantém seu próprio conjunto de consultas.
- `dist/modules/weather-data-layer.js`: validação estrita, normalização e snapshots por cidade. O frontend ainda consome parte do contrato bruto; mantenha a ponte durante uma migração gradual.
- `dist/modules/met-merge.js`: combinação por horário; MET preenche campos disponíveis, Open-Meteo conserva os demais. Não substituir aparente, UV, probabilidade ou totais diários com valores inventados. Agregados diários MET exigem cobertura suficiente.
- `hourly-outlook.js`, `hourly-detail.js`, `weather-insights.js`, `weather-extras.js`, `risks.js`: interpretação e detalhes meteorológicos. Consulte essas implementações antes de criar regras duplicadas.
- `modules/share-weather.js`: compartilha texto a partir do snapshot normalizado, com fonte/idade e calendário municipal. Web Share, clipboard e seleção manual são fallbacks em sequência; cancelar o share não deve copiar. Troca de cidade invalida respostas pendentes. Não incluir coordenadas ou dados da conta no texto.
- `smart-summary.js`: contexto, hash, resumo determinístico e validação. IA é um aprimoramento opcional para usuário autenticado; o fallback deve aparecer imediatamente. A primeira previsão pode ser pintada antes de AQI/MET, mas a IA aguarda essa complementação.
- `weather-map.js`: instância única Leaflet, radar RainViewer, satélite GOES/NASA e raios Xweather. `radar-probe.js` usa um cliente próprio. Não colocar suas consultas no grupo de cancelamento da previsão principal.
- `account.js`: Supabase Auth e integração da conta; `modules/account-sync.js`: transporte serializado, revisão de usuário e snapshot canônico; `favorite-cities.js`: leituras breves, com concorrência limitada; `saved-places.js`: nomes pessoais de cidades, sincronização e tombstones; `notifications.js`: opt-in Web Push e preferências.
- `supabase/functions/`: serviços Deno; `_shared/` contém HTTP, autenticação/admin, Web Push e política de notificações. `supabase/migrations/` contém RLS, quotas, Vault e cron. SDK e credenciais administrativas ficam no servidor; a chave publicável da conta não é um segredo.

## Tempo, astronomia e intervalos

`modules/city-time.js` é a fonte de interpretação de horário municipal. Carregue-o antes de SunCalc/atmosfera e dos consumidores. Use `PLUVIA.time.parse(value, city)`, `dayKey(at, city)` e `hourIndex(times, city, at)`; nunca interpretar um timestamp municipal sem offset com `new Date(value)` ou `Date.parse(value)` dependente do dispositivo. Datas diárias são calendários, não instantes: formate uma data ancorada em UTC com `timeZone:'UTC'`.

A conversão calcula o offset na data solicitada, inclusive DST. Uma hora inexistente é inválida; uma hora repetida sem offset é ambígua e deve receber offset explícito quando o provedor o oferece. Os fusos IANA dos municípios são a referência. Não inferir horário pelo dispositivo ou tempo desde a abertura.

`sky-atmosphere.js` controla fase, transições, clima e coordenadas ilustradas dos astros para intro e home. Usa a linha solar do dia municipal, com fallback calculado por coordenadas via `vendor/suncalc.js`. `sky.dayAt(at)` também alimenta o card solar. A Lua usa `PLUVIA.moon.getMoonPosition`: altitude e azimute **em graus** na biblioteca local. Ela aparece no céu noturno somente acima do horizonte. A fase/textura é responsabilidade de `moon-view.js`; reutilize `#moonDisc`. Não adicionar outro Sol, disco lunar ou timer independente de trajetória. O arco solar preserva a projeção artística do produto; ele não é um mapa de azimute.

O relógio de 30 segundos atualiza a atmosfera e o card solar, e redesenha os dados apenas quando muda hora, data, fase diurna ou expira AQI. Não recriar o DOM a cada frame. O `is_day` de uma previsão salva não pode congelar o céu de ontem.

Eventos solares da timeline devem usar `sky.dayAt`, assim como o card. Iluminação da Lua usa a leitura de `moon-view`; não criar outra efeméride. UV mostra classificação atual e pico aproximado do dia municipal, inclusive quando o pico já passou; lacunas não viram zero nem linhas contínuas no gráfico. Pressão exige amostras separadas por três horas reais e deve identificar a série modelada.

Precipitação e probabilidade horárias Open-Meteo correspondem ao intervalo que **termina** no timestamp. Para representar a chuva a partir da hora `i`, usar `i+1`. MET `next_1_hours` começa no ponto informado e deve ser colocado no intervalo seguinte. Preserve esse alinhamento no resumo, favoritos, gráfico, detalhe e push. Valores ausentes não são zero nem evidência de tempo tranquilo.

## Estado, erros e cache

Uma seleção manual invalida GPS e carregamento anterior de detalhes municipais. A troca de cidade incrementa `cityRevision`, cancela consultas, limpa estado antigo e não permite que respostas anteriores preencham a cidade nova. Uma função assíncrona que pinta UI deve conferir a revisão/identidade após cada await relevante.

IA precisa conferir cidade, usuário e hash do contexto **atual**, inclusive na mesma cidade após atualizar a previsão. Não comparar `context.contextHash`: calcule `smartSummary.contextHash(context)`. O hash v2 deve permanecer idêntico entre frontend e `functions/smart-summary`; caches de texto usam `copy-3`. Publicação do frontend e da função deve ser coordenada; incompatibilidade mantém fallback determinístico, mas a IA não será aplicada.

Cache meteorológico admite leitura salva por até 36h e deve identificar isso na interface. `weatherAt` e `airAt` têm idades independentes. Uma previsão nova não renova AQI antigo. Use `weatherData.cachedAir`; `airAt:null` significa ausência de leitura válida. Cache legado sem `airAt` usa seu timestamp original. Redesenhar por relógio não pode renovar a idade de dados ou favoritos. Snapshots, formatters e conversões têm limites de memória.

Poluentes são concentrações em µg/m³, separados do US AQI; não somar índices nem atribuir uma causa à poluição. Os detalhes usam `snapshot.airQuality` e `airSource`, sem fetch próprio. Favoritos reaproveitam consulta breve com sensação/extremos; preservam concorrência 2, cache 20min e limite 36h. Extremos de um dia anterior precisam identificar a data; horário local usa o fuso municipal. Não consultar alertas individualmente em todos os cards.

Cancelamento não é timeout nem erro de JSON. Preserve códigos `cancelled`, `timeout`, `rate_limited`, `invalid_response` e `provider_unavailable`; não repetir uma consulta cancelada. Requests concluídos devem remover timers e listeners.

No INMET, código IBGE informado é autoritativo; um código diferente não permite fallback pelo nome. Nomes parciais não confirmam municípios ou estados. Aviso estadual precisa indicar confirmação no mapa. Datas e severidade devem vir da fonte, nunca ser fabricadas. Push oficial exige área e validade confirmadas e deve continuar sendo processado se a previsão falhar.

Destinos Web Push são validados por `_shared/push-endpoint.ts` no cadastro e **também antes do envio** de inscrições legadas. Manter a allowlist explícita dos serviços Chromium/Firefox/Apple/Windows; não aceitar qualquer HTTPS ou ampliar com sufixos vagos. Nova integração exige validar o serviço do navegador e atualizar testes, sem registrar tokens/endpoints em logs.

`push-process` pagina locais por UUID com cursor persistido em `private.push_worker_state`. `pluvia_push_claim` e `pluvia_push_checkpoint` são RPCs exclusivamente de `service_role`; a lease expira em três minutos. Publicar a migration antes do worker. Não voltar à seleção fixa dos primeiros 100 locais nem liberar esses RPCs para clientes. Cada execução seleciona até 100 locais, começa trabalho por até 90 segundos e preserva o local incompleto para a próxima rodada. O cursor avança após tentativa concluída, inclusive falhas de fonte, para um provedor indisponível não travar a fila. Inscrições/eventos/entregas conservam suas restrições de deduplicação.

Push aceita somente números finitos nas faixas válidas e leitura atual com timestamp de até 90 minutos (tolerância futura de 15 minutos); null/string/boolean não viram zero. Horizonte usa o relógio real, chuva exige intervalo de uma hora e quantidade/probabilidade da mesma amostra. Resumo diário procura o dia municipal, sem assumir índice zero. URLs idênticas, inclusive falhas, compartilham Promise só durante a execução; não guardar esses dados em cache duradouro. `adminClient(8000)` limita requests do worker; chamadas sem argumento preservam o comportamento dos demais serviços. Veja `docs/NOTIFICATION-RELIABILITY.md` e `scripts/verify-push-scheduler.sql` (verificação com rollback, sem envios).

## Conta e preferências concorrentes

`auth.users.raw_user_meta_data` continua a fonte remota de favoritos, cidade principal, locais e nome; não há uma segunda tabela de preferências. A função `account-preferences` verifica o usuário por Auth, confere `ownerId` e aplica operações por item. `_shared/account-preferences.js` concentra validação, limites, conflitos e normalização. `pluvia_account_patch` compara o JSON completo esperado antes do patch: se outra escrita chegou primeiro, a função relê e tenta novamente, no máximo três vezes. O RPC é exclusivo de `service_role`, com `search_path` vazio e allowlist de campos. Nunca liberar sua execução para anon/authenticated.

Não voltar a gravar arrays completos com `auth.updateUser` no cliente. O nome do perfil também usa esse fluxo para não concorrer com as listas. Auth signup continua definindo o nome inicial. `user_metadata` não autoriza acesso e nomes nunca entram como HTML.

Favoritos usam operações adicionar/remover e têm limite 30. Uma edição de local usa a versão capturada **ao iniciar a edição**, não a versão recebida por uma atualização posterior; conflito pede revisão, sem sobrescrita silenciosa. Versões são geradas no servidor; limite 20 locais ativos e 20 tombstones. No merge legado/visitante, remoção vence empate de timestamp. Não ressuscitar ID excluído por editar uma versão antiga.

`account-sync` serializa requests, deduplica leituras e invalida respostas/controladores na troca de conta, inclusive A → B → A. Revalidar ao reconectar/retornar ao app respeita freshness de 30 segundos; não adicionar polling por componente. Favoritos/cidade principal usam outbox local **por usuário**, bounded e sem nomes/endereços/GPS, preservado inclusive durante requests. Locais e nome exigem confirmação do servidor; não prometer fila offline para eles. Snapshot canônico prevalece sobre metadata antiga do SDK. Atualizações preservam texto focado, mas troca de conta limpa esse campo.

Publicar migration e função antes da interface. Clientes antigos ainda podem usar read-merge-write e sobrescrever listas; atualizar a geração do SW é necessário, mas não garante atualização instantânea de todas as instalações. Não alegar sync em tempo real ou consistência absoluta contra writers legados. Consulte `docs/ACCOUNT-SYNCHRONIZATION.md`.

## Mapa, mobile e acessibilidade

Mantenha uma instância do mapa. Revisão da camada e cancelamento impedem resultados fora de ordem, inclusive durante inicialização ou troca de cidade fora da tela. Remova overlays pendentes e os que ainda estão terminando o fade. Reprodução para quando a página fica oculta ou o card sai da área observada; o modal aberto conta como visível. Mover o mapa ao diálogo exige `invalidateSize`.

CSS final é uma cascata intencional: `sky.css`, `styles.css`, `redesign.css`, `continuous.css`. O visual atual usa fundo contínuo e limita largura; regras antigas podem ser sobrescritas. Não limpar CSS por aparência sem validar os seletores efetivamente usados. Não restaurar blur/vidro pesado no painel só porque existe no CSS legado.

Preserve safe areas, `svh`/`dvh`, viewport dinâmico e integração `visualViewport` dos diálogos. Teste teclado, orientação horizontal, toque e áreas pequenas, além de Android/desktop. Não usar hacks por modelo de iPhone. Preserve `prefers-reduced-motion`, foco, labels e controles nativos. O status de dados antigos deve ser visível, mesmo que o status normal permaneça discreto.

## PWA e publicação

`sw.js` guarda o shell e assets estáticos, nunca APIs externas/Auth. Ao mudar JS/CSS publicado, atualize **juntos** as versões de referência no HTML, preload quando existir, `PRECACHE` e a geração `CACHE`. Testes de contrato travam essas referências e devem acompanhar a nova versão. Não apagar o fallback offline ou a atualização quando o usuário estiver digitando.

Durante fetch, registrar `waitUntil` de forma síncrona e esperar as gravações do cache sem bloquear a entrega da resposta. Erros HTTP nunca são guardados como shell válido.

GitHub Pages publica `dist/` no push para `main`; PR não publica produção. Funções Supabase são publicadas separadamente. `.openai/hosting.json` é um vínculo existente com Sites; não mudar destino/domínio por preferência.

## Validação

Na raiz, com Node 24:

```sh
for file in dist/*.js dist/modules/*.js dist/vendor/*.js dist/dev-server.cjs; do node --check "$file" || exit; done
node --test tests/*.test.cjs
```

Os testes incluem assertions diretas e casos `node:test` com VMs do DOM. Injete/carregue dependências reais quando um módulo passar a depender delas. Preferir testes de comportamento para async, tempo e dados; não substituir um teste de falha por um regex que apenas descreve a implementação.

Se o ambiente ocultar a saída de processos filhos Node, execute cada arquivo diretamente, preservando o código de saída:

```sh
for file in tests/*.test.cjs; do node "$file" || exit; done
```

Com Deno disponível:

```sh
deno check supabase/functions/*/index.ts supabase/functions/met-forecast/index.js supabase/functions/lightning/index.js
```

A validação de PR também verifica tipos das funções. Não há lint, `tsconfig` frontend ou build de produção configurado: não invente resultados desses comandos. Publicação é dos arquivos estáticos.

Preview: `node dist/dev-server.cjs --host 127.0.0.1 --port 4173`. Verifique a página em navegador, console, troca de cidade e diálogos. Testes de rede com fixtures não comprovam disponibilidade de APIs reais, entrega Web Push, autenticação de produção nem hardware iOS. Consulte `docs/STABILITY-AUDIT.md` para resultados e riscos remanescentes.

QA opcional com Python Playwright instalado: `python scripts/verify-browser.py`; `PLUVIA_BROWSER=webkit` seleciona WebKit instalado. O script bloqueia Auth/push e usa somente fixtures de clima; verifica sete viewports, favoritos, detalhes, compartilhamento, stale e troca de cidade, com dispositivo em Asia/Tokyo. Screenshots vão para a pasta temporária `pluvia-qa`, alterável por `PLUVIA_QA_OUTPUT`. Consulte `docs/PRODUCT-EVOLUTION.md` para o inventário dos 38 pedidos e decisões de evolução.

QA da conta: `python scripts/verify-account-sync.py` (ou `PLUVIA_BROWSER=webkit`). Usa SDK real, duas sessões fictícias e serviço local, interceptando Auth/push; nunca modifica contas reais. `scripts/verify-account-preferences.sql` verifica CAS e grants dentro de rollback, sem imprimir dados pessoais.

## Plugins e métricas opcionais

Consultar `docs/PLUGIN-INTEGRATIONS.md` antes de adicionar integrações. Conexão ChatGPT não concede automaticamente credenciais de runtime, cobertura ou licença de redistribuição. Preserve Supabase/Pages e APIs estáveis; não criar backend/analytics duplicados por disponibilidade de plugin.

`dist/analytics.js` usa apenas token público de ingestão PostHog. Coleta começa desligada, respeita DNT/GPC, usa ID criptográfico apenas em memória e não vincula Auth; `identify` mantém compatibilidade como no-op. Preservar allowlist de eventos/propriedades e exclusão de cidade/GPS/nome/texto/URL/stack. Telemetria jamais pode alterar exceções de HTTP ou bloquear UI. O painel conta eventos de participantes, não todos os visitantes ou pessoas únicas. Não ativar autocapture/replay nem flag remota sem justificar a necessidade e rever privacidade. Ver `docs/ANALYTICS.md`.

Raios: preservar teto atômico 150 consultas/mês, cache 5min, raio 40km, atribuição Xweather e credenciais somente servidor. `/lightning` multiplica por 10 os acessos do provedor. Cache público deve ser reconstruído pela allowlist; não devolver JSON bruto de banco/API. Flights deduplicam por área apenas na instância, e cada chamada cria sua própria Response/CORS. Logs somente componente/código fixo, sem URL do provedor, credenciais, IP ou localização. Falha de autorização/limite/cache não é observação de ausência de raios.

PostgREST `return=minimal`: upsert confirmado pode responder 200/201/204 sem corpo. Não chamar `.json()` para esse contrato nem transformar cache persistido em falha. Requests que exigem resposta, como a reserva booleana, continuam validando JSON. Diagnóstico de banco pode incluir estágio fixo, status HTTP e código PostgREST allowlisted; nunca mensagem/bruto/URL.

## Login social

Google/Apple usam Supabase Auth existente e modules/social-auth.js. Exibir botão somente se /auth/v1/settings confirmar o provider; chave publicável não habilita OAuth. Preservar fluxo browser e confirmação por e-mail; não criar segundo cliente Auth nem migrar flowType global por conveniência. Redirect social canônico ?auth_return=1, allowlist do servidor e authorize no domínio do projeto. Nunca aceitar next/URL arbitrária ou exibir error_description bruto. Limpar retorno após SDK consumir sessão; perfil existente pede nome ausente na Apple. Secrets OAuth e .p8 somente servidor/proprietário. Apple web exige rotação até 6 meses. Consulte docs/SOCIAL-AUTH.md antes de habilitar ou alterar a integração. Não vincular identidades por comparação de e-mail no cliente.

## Evolução: e-mails, exclusão, avisos favoritos e QA

Templates Auth vivem em `supabase/templates/`; config local não aplica templates hospedados. Ver `docs/ACCOUNT-EMAILS.md`. Não usar config push com arquivo incompleto nem adicionar rastreio/nome arbitrário no HTML. Recuperação deriva do evento PASSWORD_RECOVERY, nunca só da query. Exclusão usa `account-delete`, JWT/getUser, amr recente, confirmação e revogação global antes de hard delete; não criar endpoint que aceite ID de outro usuário, metadata de autorização ou iat de refresh como reautenticação.

`inmetArea`/`selectInmetAlerts` aceitam cidade opcional; `modules.alerts.forCity` reaproveita a leitura nacional, com freshness/indisponibilidade. Não buscar INMET por favorito nem duplicar matcher. Região explícita conflitante impede fallback por nome único. O relógio central notifica cards abertos; não adicionar timer/fetch por card.

`continuous.css` define pluvia-dialog-enter para todos os diálogos existentes, preservando top layer/foco/viewport e respeitando reduced motion. Animar somente opacity/transform, sem medir layout em frames ou adicionar blur. `visual.yml` executa Chromium/WebKit e guarda screenshots; ver `docs/OPERATIONS-AND-QA.md` para limites, hardware e monitoramento. Não confundir QA com fixtures com autenticação/exclusão/envio real. Nowcast: ler `docs/NOWCAST-EVALUATION.md`; timestamps de 15 minutos interpolados não sustentam precisão de 15 minutos.
