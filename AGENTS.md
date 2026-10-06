# Trabalhar no PLUVIA

## Produto e arquitetura reais

O PLUVIA é um painel meteorológico brasileiro estático. `dist/` é código-fonte publicado, não uma pasta descartável de build. Não há React, bundler, hooks de framework, compilação frontend ou dependências npm a instalar na raiz. Preserve a identidade visual, o painel público, os favoritos, as cidades salvas, os avisos oficiais e o PWA. Mudanças visuais precisam resolver um problema concreto.

Leia os arquivos envolvidos e seus consumidores antes de editar. O estado e a ordem dos scripts são parte do contrato: os scripts clássicos compartilham declarações lexicais (`activeCity`, `cityRevision`, `displayedWeather`, `favorites`, `cityById`) e os módulos expõem APIs em `globalThis.PLUVIA`. Muitos módulos puros também oferecem CommonJS para testes. Não transforme scripts em ES modules sem mapear essa integração.

## Onde cada responsabilidade vive

- `dist/index.html`: DOM, SVG compartilhado, abertura e ordem de carregamento.
- `dist/app.js`: escolha de cidade, revisões de consultas, atualização, cache meteorológico e renderização dos cards.
- `dist/p0.js`: abertura pública, fallback de localização, teclado da busca, atualização do SW e viewport dos diálogos. Não sobrescreve mais funções de `app.js`: `renderCityOptions`/`updateCityLabels` efetivos vivem em `app.js`; não reintroduzir monkey-patch.
- `dist/capitals.js`: capitais, busca, normalização dos nomes e carregadores municipais. `municipality-index.js` é leve; `cities/<uf>.js` traz detalhes sob demanda; `municipalities.js` completo é reservado ao GPS. O catálogo contém 5.571 municípios. Regenere índices com `node scripts/chunk-municipalities.cjs` quando mudar o catálogo.
- `dist/modules/http-client.js`: timeout, cancelamento, classificação de erros e limpeza de controllers.
- `dist/modules/weather-services.js`: URLs e consultas Open-Meteo, CAMS, INMET, MET Norway e ensemble. Deduplica consultas simultâneas idênticas; sinais externos mantêm cancelamento independente. Cada cliente mantém seu próprio conjunto de consultas.
- `dist/modules/weather-data-layer.js`: validação estrita, normalização e snapshots por cidade. O frontend ainda consome parte do contrato bruto; mantenha a ponte durante uma migração gradual.
- `dist/modules/met-merge.js`: combinação por horário; MET preenche campos disponíveis, Open-Meteo conserva os demais. Não substituir aparente, UV, probabilidade ou totais diários com valores inventados. Agregados diários MET exigem cobertura suficiente.
- `hourly-detail.js`, `weather-insights.js`, `weather-extras.js`, `risks.js`: interpretação e detalhes meteorológicos. Consulte essas implementações antes de criar regras duplicadas.
- `modules/share-weather.js`: compartilha texto a partir do snapshot normalizado, com fonte/idade e calendário municipal. Web Share, clipboard e seleção manual são fallbacks em sequência; cancelar o share não deve copiar. Troca de cidade invalida respostas pendentes. Não incluir coordenadas ou dados da conta no texto.
- `smart-summary.js`: regras/hash preservados para compatibilidade e testes do servidor. O Resumo Inteligente foi retirado da Home por solicitação do usuário: não carregar o módulo, consultar a função de IA ou recriar o card sem nova solicitação. AQI/MET continuam complementando a primeira previsão progressivamente.
- `weather-map.js`: instância única Leaflet (servida de `vendor/leaflet/`, sem CDN), radar RainViewer, satélite GOES/NASA e raios Xweather. `radar-probe.js` usa um cliente próprio. Não colocar suas consultas no grupo de cancelamento da previsão principal.
- `account.js`: Supabase Auth e integração da conta; `modules/account-sync.js`: transporte serializado, revisão de usuário e snapshot canônico; `favorite-cities.js`: leituras breves, com concorrência limitada; `saved-places.js`: nomes pessoais de cidades, sincronização e tombstones; `notifications.js`: opt-in Web Push e preferências.
- `supabase/functions/`: serviços Deno; `_shared/` contém HTTP, autenticação/admin, Web Push e política de notificações. `supabase/migrations/` contém RLS, quotas, Vault e cron. SDK e credenciais administrativas ficam no servidor; a chave publicável da conta não é um segredo.

## Tempo, astronomia e intervalos

`modules/city-time.js` é a fonte de interpretação de horário municipal. Carregue-o antes de SunCalc/atmosfera e dos consumidores. Use `PLUVIA.time.parse(value, city)`, `dayKey(at, city)` e `hourIndex(times, city, at)`; nunca interpretar um timestamp municipal sem offset com `new Date(value)` ou `Date.parse(value)` dependente do dispositivo. Datas diárias são calendários, não instantes: formate uma data ancorada em UTC com `timeZone:'UTC'`.

A conversão calcula o offset na data solicitada, inclusive DST. Uma hora inexistente é inválida; uma hora repetida sem offset é ambígua e deve receber offset explícito quando o provedor o oferece. Os fusos IANA dos municípios são a referência. Não inferir horário pelo dispositivo ou tempo desde a abertura.

`sky-atmosphere.js` controla fase, transições, clima e coordenadas ilustradas dos astros para intro e home. Usa a linha solar do dia municipal, com fallback calculado por coordenadas via `vendor/suncalc.js`. `sky.dayAt(at)` também alimenta o card solar. A Lua do fundo é uma ilustração da noite municipal: percorre o arco noturno já calculado em `sky-atmosphere`, mesmo antes do nascer real, e as nuvens a cobrem pela composição. Não ocultá-la por código meteorológico ou altitude real. Fase/iluminação continuam astronômicas. `PLUVIA.moon.getMoonPosition` (graus) e getMoonTimes permanecem disponíveis para os horários reais do card, que não representam a posição decorativa do fundo. A fase/textura é responsabilidade de `moon-view.js`; reutilize `#moonDisc`. Não adicionar outro Sol, disco lunar ou timer independente de trajetória. No card Ciclo do dia, `#moonDot` reutiliza `#moonDisc` via `<use>` e, somente à noite, percorre o mesmo arco do Sol entre o pôr e o próximo nascer (`sky.dayAt` de ontem/amanhã), atualizado por `renderSun` no relógio central; é ilustração, não posição real da Lua. O arco solar preserva a projeção artística do produto; ele não é um mapa de azimute.

O relógio de 30 segundos atualiza a atmosfera e o card solar, e redesenha os dados apenas quando muda hora, data, fase diurna ou expira AQI. Não recriar o DOM a cada frame. O `is_day` de uma previsão salva não pode congelar o céu de ontem.

Eventos solares da timeline devem usar `sky.dayAt`, assim como o card. Iluminação da Lua usa a leitura de `moon-view`; não criar outra efeméride. UV na Home mostra leitura atual, classificação e barra; pico e gráfico diário foram retirados a pedido. Valores ausentes não viram zero ou classificação extrema. As funções puras de UV permanecem disponíveis para consumidores futuros. Pressão exige amostras separadas por três horas reais e deve identificar a série modelada.

`sky.astronomyAt` concentra crepúsculo civil e nascer/pôr da Lua. SunCalc lunar varre dias UTC: reunir os dias que intersectam o calendário municipal e filtrar pelos limites locais reais, inclusive DST. Ausência de evento não é falha. Não recalcular esses eventos no card ou criar timer independente. A fração iluminada vem da mesma leitura de `moon-view`.

`outdoor-planner.js` está preservado para testes/compatibilidade, mas não carrega na Home: o bloco Planejar ao ar livre foi retirado a pedido. Seu algoritmo compara duas horas futuras com luz do dia nas próximas 24h; reutiliza `hourlyDetail`, `city-time` e `sky.dayAt`. Não recomendar com cache salvo, leitura antiga ou aviso oficial vigente confirmado. Dados ausentes não são zero; UV/rajadas parciais são identificados e extremos conhecidos vetam a janela. É comparação de modelos, sem garantia de segurança. Ver `docs/DAILY-PLANNING.md` para critérios e limites.

Precipitação e probabilidade horárias Open-Meteo correspondem ao intervalo que **termina** no timestamp. Para representar a chuva a partir da hora `i`, usar `i+1`. MET `next_1_hours` começa no ponto informado e deve ser colocado no intervalo seguinte. Preserve esse alinhamento no resumo, favoritos, gráfico, detalhe e push. Valores ausentes não são zero nem evidência de tempo tranquilo. A timeline reutiliza `hourlyDetail.detail` para validar leituras. O botão Quando pode chover foi retirado por duplicar a leitura horária; o detalhe deve funcionar sem seus antigos elementos. hourly-outlook/rainCopy permanecem apenas para compatibilidade/testes, sem carregar o painel na Home. Barras de chuva são proporcionais apenas ao volume; probabilidade tem label separado e nunca aumenta uma barra de volume. O modo Sensação usa a série aparente, sem fabricar fallback a partir da temperatura.

## Estado, erros e cache

Uma seleção manual invalida GPS e carregamento anterior de detalhes municipais. A troca de cidade incrementa `cityRevision`, cancela consultas, limpa estado antigo e não permite que respostas anteriores preencham a cidade nova. Uma função assíncrona que pinta UI deve conferir a revisão/identidade após cada await relevante.

Se o Resumo Inteligente for reativado em uma etapa autorizada, a IA precisa conferir cidade, usuário e hash do contexto **atual**, inclusive na mesma cidade após atualizar a previsão. Não comparar `context.contextHash`: calcule `smartSummary.contextHash(context)`. O hash v2 deve permanecer idêntico entre frontend e `functions/smart-summary`; caches de texto usam `copy-3`. Publicação do frontend e da função deve ser coordenada; incompatibilidade mantém fallback determinístico, mas a IA não será aplicada.

Cache meteorológico admite leitura salva por até 36h e deve identificar isso na interface. `weatherAt` e `airAt` têm idades independentes. Uma previsão nova não renova AQI antigo. Use `weatherData.cachedAir`; `airAt:null` significa ausência de leitura válida. Cache legado sem `airAt` usa seu timestamp original. Redesenhar por relógio não pode renovar a idade de dados ou favoritos. Snapshots, formatters e conversões têm limites de memória.

Poluentes são concentrações em µg/m³, separados do US AQI; não somar índices nem atribuir uma causa à poluição. Os detalhes usam `snapshot.airQuality` e `airSource`, sem fetch próprio. Favoritos reaproveitam consulta breve com sensação/extremos; preservam concorrência 2, cache 20min e limite 36h. Extremos de um dia anterior precisam identificar a data; horário local usa o fuso municipal. Não consultar alertas individualmente em todos os cards.

Cancelamento não é timeout nem erro de JSON. Preserve códigos `cancelled`, `timeout`, `rate_limited`, `invalid_response` e `provider_unavailable`; não repetir uma consulta cancelada. Requests concluídos devem remover timers e listeners.

No INMET, código IBGE informado é autoritativo; um código diferente não permite fallback pelo nome. Nomes parciais não confirmam municípios ou estados. Aviso estadual precisa indicar confirmação no mapa. Datas e severidade devem vir da fonte, nunca ser fabricadas. Push oficial exige área e validade confirmadas e deve continuar sendo processado se a previsão falhar.

Destinos Web Push são validados por `_shared/push-endpoint.ts` no cadastro e **também antes do envio** de inscrições legadas. Manter a allowlist explícita dos serviços Chromium/Firefox/Apple/Windows; não aceitar qualquer HTTPS ou ampliar com sufixos vagos. Nova integração exige validar o serviço do navegador e atualizar testes, sem registrar tokens/endpoints em logs.

`push-process` pagina locais por UUID com cursor persistido em `private.push_worker_state`. `pluvia_push_claim` e `pluvia_push_checkpoint` são RPCs exclusivamente de `service_role`; a lease expira em três minutos. Publicar a migration antes do worker. Não voltar à seleção fixa dos primeiros 100 locais nem liberar esses RPCs para clientes. Cada execução seleciona até 100 locais, começa trabalho por até 90 segundos e preserva o local incompleto para a próxima rodada. O cursor avança após tentativa concluída, inclusive falhas de fonte, para um provedor indisponível não travar a fila. Inscrições/eventos/entregas conservam suas restrições de deduplicação.

Push aceita somente números finitos nas faixas válidas e leitura atual com timestamp de até 90 minutos (tolerância futura de 15 minutos); null/string/boolean não viram zero. Horizonte usa o relógio real, chuva exige intervalo de uma hora e quantidade/probabilidade da mesma amostra. Resumo diário procura o dia municipal, sem assumir índice zero. URLs idênticas, inclusive falhas, compartilham Promise só durante a execução; não guardar esses dados em cache duradouro. `adminClient(8000)` limita requests do worker; chamadas sem argumento preservam o comportamento dos demais serviços. Veja `docs/NOTIFICATION-RELIABILITY.md` e `scripts/verify-push-scheduler.sql` (verificação com rollback, sem envios).

Preservar `minimum_severity`, `quiet_start/end` e `timezone` ao salvar ou reativar notificações; adicionar cidade não muda o fuso silenciosamente. `notificationPreferences` normaliza horários SQL e valida a coleta. Silêncio global usa o fuso escolhido, resumo usa o da cidade e severidade 4 pode interromper silêncio. A UI precisa refletir essas exceções. Leituras de configuração usam revisão, inclusive A → B → A. QA `verify-daily-planning.py` usa somente fixtures, nunca Push real.

## Conta e preferências concorrentes

`auth.users.raw_user_meta_data` continua a fonte remota de favoritos, cidade principal, locais e nome; não há uma segunda tabela de preferências. A função `account-preferences` verifica o usuário por Auth, confere `ownerId` e aplica operações por item. `_shared/account-preferences.js` concentra validação, limites, conflitos e normalização. `pluvia_account_patch` compara o JSON completo esperado antes do patch: se outra escrita chegou primeiro, a função relê e tenta novamente, no máximo três vezes. O RPC é exclusivo de `service_role`, com `search_path` vazio e allowlist de campos. Nunca liberar sua execução para anon/authenticated.

Não voltar a gravar arrays completos com `auth.updateUser` no cliente. O nome do perfil também usa esse fluxo para não concorrer com as listas. Auth signup continua definindo o nome inicial. `user_metadata` não autoriza acesso e nomes nunca entram como HTML.

Favoritos usam operações adicionar/remover e têm limite 30. Uma edição de local usa a versão capturada **ao iniciar a edição**, não a versão recebida por uma atualização posterior; conflito pede revisão, sem sobrescrita silenciosa. Versões são geradas no servidor; limite 20 locais ativos e 20 tombstones. No merge legado/visitante, remoção vence empate de timestamp. Não ressuscitar ID excluído por editar uma versão antiga.

`account-sync` serializa requests, deduplica leituras e invalida respostas/controladores na troca de conta, inclusive A → B → A. Revalidar ao reconectar/retornar ao app respeita freshness de 30 segundos; não adicionar polling por componente. Favoritos/cidade principal usam outbox local **por usuário**, bounded e sem nomes/endereços/GPS, preservado inclusive durante requests. Locais e nome exigem confirmação do servidor; não prometer fila offline para eles. Snapshot canônico prevalece sobre metadata antiga do SDK. Atualizações preservam texto focado, mas troca de conta limpa esse campo.

Publicar migration e função antes da interface. Clientes antigos ainda podem usar read-merge-write e sobrescrever listas; atualizar a geração do SW é necessário, mas não garante atualização instantânea de todas as instalações. Não alegar sync em tempo real ou consistência absoluta contra writers legados. Consulte `docs/ACCOUNT-SYNCHRONIZATION.md`.

## Mapa, mobile e acessibilidade

Ícones são os 22 SVGs originais de `assets/weather-icons/conditions` e os 16 indicadores de `metrics`, gerados por `scripts/generate-modern-weather-icons.cjs`. Reutilizar `PLUVIA.weatherIcons` para WMO, dia/noite, labels e markup; não criar outro mapa ou usar emoji por componente. Volume vem de gradientes estáticos sem filtros/animação. WMO 1 tem nuvem menor que 2, trovoada 95 não inventa chuva, e a Lua ilustrada não altera a fase astronômica do fundo. Sensação/máxima/mínima reutilizam os três nomes existentes, com ícone de 28px dentro de `.metric-head`, acima do título, e valores alinhados; não ocultar esses ícones ou duplicar labels acessíveis. Cores ilustrativas não classificam valores nem substituem escalas/bússola reais. Símbolos do mapa são independentes. Ler `docs/WEATHER-ICONS.md`; QA `verify-weather-icons.py` roda em Chromium/WebKit, além do QA da interface. Preservar orçamento e versões/precache ao regenerar.

Mantenha uma instância do mapa. Revisão da camada e cancelamento impedem resultados fora de ordem, inclusive durante inicialização ou troca de cidade fora da tela. Remova overlays pendentes e os que ainda estão terminando o fade. Reprodução para quando a página fica oculta ou o card sai da área observada; o modal aberto conta como visível. Mover o mapa ao diálogo exige `invalidateSize`.

CSS final é uma cascata intencional: `sky.css`, `styles.css`, `redesign.css`, `continuous.css`. O visual atual usa fundo contínuo e limita largura; regras antigas podem ser sobrescritas. Não limpar CSS por aparência sem validar os seletores efetivamente usados. Não restaurar blur/vidro pesado no painel só porque existe no CSS legado.

Tipografia: `fonts.css` declara WOFF2 locais, com swap/preload/precache. `--font-ui` usa Inter variável (100–900) e fallback do sistema; `--font-brand` conserva Nunito 900 somente nas três assinaturas PLUVIA. O subconjunto da marca contém apenas suas letras, não serve para textos comuns. Ver `dist/assets/fonts/README.md` e as licenças OFL. Texto normal usa peso 400, títulos principais 600 e temperatura do hero 300; horários/previsões usam tabular-nums sem uma segunda família numérica. O número principal conserva proporcional-nums. A leitura completa (número + grau) compartilha o eixo central da cidade e da marca; o grau participa do flex, sem posição absoluta que desloque visualmente o conjunto. Validar com fontes carregadas e com fallback; nunca bloquear a interface esperando fontes. Arquivos de fonte recebem novos nomes versionados quando mudarem.

No cabeçalho, símbolo e nome PLUVIA ficam próximos (gap 2px), com o texto no mesmo azul #2f6bff da marca em todas as condições. A linha visual de horário/data foi retirada a pedido; o relógio central continua atualizando céu, astronomia, dados e consumidores. Não reintroduzir dependência dos antigos localClock/localDate/cityTimezone para essas atualizações.

A intro usa a mesma assinatura azul e gap 2px do cabeçalho. Seu CSS inline inclui o fallback #2f6bff para o primeiro paint; a gota herda currentColor. Não recolorir a marca por fase do céu. Slogan, fundo e progresso continuam respondendo à paleta astronômica existente.

Textos de destaque que já são azuis usam `--brand-blue:#2f6bff`, definido na folha final. `--reading-link`, `--graphic-blue` e `--map-link` reutilizam esse token em todas as fases/condições; não criar tons alternativos de azul para dias destacados, precipitação, Ciclo do dia e links de fontes. O usuário confirmou que textos comuns e secundários devem voltar às paletas originais de branco/cinza (com variantes legíveis durante o dia). Não aplicar azul globalmente a todo o conteúdo, placeholders ou severidades, nem recolorir as imagens meteorológicas.

`--blue` também referencia a marca na folha final, independentemente do tema do dispositivo. Botões primários, avatar, checkboxes, foco, seleção de cidade e controles de radar compartilham esse azul, mantendo texto/símbolos brancos sobre preenchimento azul. O badge de notificações ativas e ações reversíveis de parar avisos/sair da conta usam o mesmo destaque; erros e exclusão permanente conservam sinalização própria. Regras do radar devem funcionar em #radarMapContent tanto na Home quanto quando ele é movido ao modal. Escalas meteorológicas e cores de fornecedores OAuth permanecem próprias; não recolorir tiles/legendas de intensidade.

A barra de rolagem usa scrollbar-color com --brand-blue e trilho transparente, preservando dimensões/gestos/fade nativos. Diálogos e gráfico reutilizam essa cor; a timeline resumida conserva sua barra oculta. O fallback ::-webkit-scrollbar aplica-se apenas sem suporte ao padrão, fora de forced-colors. Alto contraste mantém cores do sistema. Safari/iOS antigos podem ignorar a personalização; não criar overlay, scrollbar falsa ou listeners de rolagem para contornar o sistema.

Leituras equivalentes precisam compartilhar linhas: os cinco horários do resumo têm a mesma borda inferior reservada, e seus valores não usam margin-top:auto. Eventos solares ficam depois das leituras comuns, sem subir a temperatura daquela coluna. Sensação, máxima e mínima usam o mesmo espaçamento e métricas dos labels. Títulos/notas das seções alinham pelo centro no desktop e empilham no celular.

A velocidade e sua unidade ficam juntas, inclusive no celular; a regra mobile legada de `redesign.css` não deve empilhar km/h na Home. A bússola permanece ao lado, sem wrap. Cabeçalho, previsão e rodapé têm o mesmo limite de 860px e as mesmas bordas laterais; a linha do rodapé não deve se estender além do conteúdo no desktop.

Na previsão diária, minmax(0,...) permite que as colunas encolham; no desktop a condição deve quebrar dentro da própria coluna. No celular cada dia é uma linha (dia/data, ícone, chuva, mínima-barra-máxima) e o texto da condição fica apenas para leitores de tela (o rótulo do botão já o inclui); a nota só aparece para chuva relevante ou UV ≥ 8. Mínima/barra/máxima têm trilhos numéricos comuns, inclusive com valores negativos ou de um dígito. Não ocultar textos ou usar deslocamentos arbitrários para corrigir sobreposição. Favoritos usam subgrid quando disponível para compartilhar linhas de nome, temperatura, condição, sensação, extremos, horário, aviso e idade. Preserve as classes desses campos; browsers antigos mantêm os cards roláveis sem cortar conteúdo. Não adicionar medições/timers por card.

O detalhe horário também compartilha as linhas de labels/valores por par via subgrid. Um label que quebra em duas linhas, inclusive com fonte fallback, não pode deslocar só o valor de sua coluna. Preserve o fallback legível/rolável sem subgrid, em vez de cortar labels ou reservar alturas fixas baseadas em uma fonte.

O cabeçalho usa três colunas com laterais iguais: conta à esquerda, marca centralizada e ações à direita, com alvos de 44px. Nomes longos podem usar ellipsis, mas não deslocar a marca. O diálogo de cidades tem uma única coluna flex **sem wrap**; flex-wrap herdado expande botões/resultados à largura intrínseca dos favoritos em telas pequenas. Somente a lista de favoritos rola horizontalmente; os resultados rolam verticalmente no dialog-scroll. O QA verifica os limites internos e o acesso ao último card/resultado, além dos alinhamentos.

O disco lunar compartilhado combina textura, máscara da fase e sombra translúcida suave. Não reintroduzir uma base preta opaca ou um contorno escuro pesado: eles desenham uma mancha artificial sobre o céu. Esses ajustes visuais não mudam a fase/fração astronômicas nem a cobertura pelas nuvens.

O rodapé sucede o espaçamento inferior da seção astronômica sem outra margem superior. A safe area inferior pertence ao padding final do rodapé; não reservar env(safe-area-inset-bottom) também no main, pois isso cria uma faixa vazia entre o último conteúdo e a marca no iPhone. Detalhes astronômicos abertos continuam no fluxo normal.

Cabeçalho, main e rodapé pertencem ao mesmo `.night-stage` isolado. Os fundos fixos do crepúsculo têm z-index negativo dentro desse contexto; um rodapé fora dele fica encoberto mesmo com `visibility:visible` e geometria correta. Não compensar com z-index por texto/ícone. `verify-visual.py` mede os pixels na cor real dos textos/links do rodapé no nascer e pôr do sol e verifica os dois botões; somente `is_visible` não detecta essa oclusão. A paleta de texto da intro/rodapé conserva branco/cinza no lado noturno do crepúsculo, com o fundo atenuado da noite; o lado diurno usa a tinta escura existente.

`scripts/verify-alignment.py` verifica geometria real em Chromium/WebKit: sete viewports, eventos solares, temperaturas de larguras diferentes, nomes longos, quatro modos do gráfico e diálogos. Confere também o eixo de número/grau, marca e cidade; nomes curtos/longos da conta sem sobreposição, alvos de 44px, bordas comuns da página e velocidade/unidade do vento na mesma linha. Consulte e meça elementos no mesmo page.evaluate: o refresh dos favoritos pode remover handles entre a resolução de um locator e sua avaliação. Fixtures e coordenadas clonadas existem somente no QA. Não alinhar alturas das barras meteorológicas ou astros, que representam valores/horários diferentes. O QA de preferências também confere os dois campos do horário silencioso.

`scripts/verify-typography.py` carrega as fontes locais reais, mede a largura dos algarismos tabulares, verifica número/grau de dia/noite e com fontes indisponíveis, e testa reload com a origem local desconectada, SW real e previsão salva identificada. A CI visual executa-o nos dois navegadores. O flag offline da automação WebKit pode impedir o próprio SW; a interrupção isolada do servidor testa falha real de transporte sem encerrar o preview compartilhado. WebKit pode emitir falhas de recurso do SDK opcional como pageerror sem stack nessa interrupção: somente as duas mensagens conhecidas são registradas separadamente, exigindo também requestfailed desse SDK; exceções JS continuam falhando. Auth/Push/sensores externos permanecem bloqueados; isso não testa conta offline, gesto ou tipografia em iPhone físico.

Nuvens usam somente as duas camadas existentes: `sky-cloud-veil.webp` ao fundo e `sky-cloud-volume.webp` à frente, em `sky.css`. Não repetir a imagem horizontalmente: isso cria emendas. O movimento alterna poucos pixels dentro de uma margem de 64px, com transform/opacity; não adicionar canvas, WebGL, turbulence ou blur animado. Pausar céu limpo, cenas fora da tela e página oculta; reduced-motion remove movimento/transição. As duas texturas do shell somam menos de 160KiB e têm alfa contínuo (64 níveis, `?v=clouds-2`); não voltar a texturas com alfa de 16 níveis, que aparecem em degraus quando esticadas. Ver `scripts/refine-cloud-textures.py`. O antigo sky-cloud-bank permanece disponível para shells legados, mas não entra no novo precache. Ver `docs/CLOUDS.md` e `scripts/verify-clouds.py`.

A paleta noturna de `sky.css` usa azul profundo/índigo, com base limpa #080f22 e variações próprias para nuvens, chuva, tempestade, neblina e neve. O fallback da abertura acompanha essa base. Ajustar os gradientes, sem escurecer texto/astros com uma camada sobre a interface ou alterar a opacidade global das nuvens. Cores diurnas e horários/pesos do crepúsculo permanecem no contrato existente.

Em céu parcial, ambas as camadas ficam com opacidade global 1; somente o alpha da textura define corpos/bordas/espaços. Diminuir essa opacidade deixa Sol/Lua atravessarem regiões densas, apesar do z-index correto (astros 1, nuvens 2). Preserve o teste de pixels de cobertura/movimento; sua textura controlada existe apenas no QA. A tonalidade noturna parcial é ajustada pelo filtro estático, sem animar filtro/máscara.

WMO 1 usa `data-clouds="few"`, derivado no mesmo motor/código que fornece a condição escrita; WMO 2 conserva o perfil parcial `standard`. Não reunir novamente as duas coberturas: isso fazia “céu quase limpo” exibir um céu cheio de nuvens. Bancos menores nas bordas reutilizam as texturas, opacidade 1 e máscaras estáticas, com tamanho limitado também pela altura estável do viewport. Root/body, intro/cache e Home devem concordar; ticks e troca de cidade não podem conservar um perfil antigo. O QA mede cobertura real e oclusão dos astros nos dois perfis. É decoração qualitativa, não porcentagem observada de nuvens.

Chuva reutiliza as duas camadas existentes com `rain-far.svg`/`rain-near.svg` e perfis WMO em `sky-atmosphere.js`. O tile e o deslocamento vertical têm 480px; não alterar um sem o outro. Probabilidade não controla densidade/volume; trovoada não implica chuva forte. Raios são dois pseudo-elementos do único `.sky-lightning`, com canais ramificados e pulsos locais espaçados. Pausa/reduced-motion devem cobrir também `::before` e `::after`; reduced-motion esconde raios. Efeitos são decorativos, sem ligação com detecções Xweather e sem consultas próprias. Os quatro SVGs somam menos de 15KB. Ver `docs/RAIN-AND-LIGHTNING.md`.

Estrelas usam uma `.sky-stars` por cena existente, atrás das nuvens/Lua. Campo estático e oito pontos de cintilação são SVGs separados, com menos de 16KB no total; não adicionar DOM/timer por estrela, rotação, canvas ou blur. `sky-atmosphere` deriva brilho do mesmo dia municipal/crepúsculo náutico em cache; nunca do tempo desde a abertura. Somente noite limpa/parcial exibe estrelas; CSS e controlador protegem contra condição desconhecida/dados legados. Pausar cintilação fora da tela/background/tempo fechado; reduced-motion mantém estrelas estáticas. É decoração, sem catálogo ou constelações reais. Ver `docs/STARS.md`.

Preserve safe areas, `svh`/`dvh`, viewport dinâmico e integração `visualViewport` dos diálogos. Teste teclado, orientação horizontal, toque e áreas pequenas, além de Android/desktop. Não usar hacks por modelo de iPhone. Preserve `prefers-reduced-motion`, foco, labels e controles nativos. O status de dados antigos deve ser visível, mesmo que o status normal permaneça discreto.

Por solicitação explícita do usuário, o PWA instalado bloqueia zoom da página, inclusive por pinça. `modules/pwa-gestures.js` detecta display-mode:standalone/navigator.standalone, acompanha mudança de modo e aplica data-pwa-no-zoom. `continuous.css` usa pan-x pan-y nesse modo; o browser conserva manipulation e pinch. Gesturestart/change do Safari são cancelados somente no modo instalado e fora de #weatherMap; Leaflet mantém zoom próprio. Não cancelar touchstart/move/end ou dblclick globalmente, nem bloquear escala da meta viewport: isso interfere em rolagem, seleção, inputs e acessibilidade no browser. `pwa-gestures.test.cjs` e `verify-browser.py` verificam transições, políticas e exceção do mapa; os modos instalados são emulados, não um teste de gesto no iPhone físico.

## PWA e publicação

`sw.js` guarda o shell e assets estáticos, nunca APIs externas/Auth. Ao mudar JS/CSS publicado, atualize **juntos** as versões de referência no HTML, preload quando existir, `PRECACHE` e a geração `CACHE`. Testes de contrato travam essas referências e devem acompanhar a nova versão. Não apagar o fallback offline ou a atualização quando o usuário estiver digitando.

Durante fetch, registrar `waitUntil` de forma síncrona e esperar as gravações do cache sem bloquear a entrega da resposta. Erros HTTP nunca são guardados como shell válido.

GitHub Pages publica `dist/` no push para `main`; PR não publica produção. Funções Supabase são publicadas separadamente. `.openai/hosting.json` é um vínculo existente com Sites; não mudar destino/domínio por preferência.

A prévia social atual é `og-pluvia-v2.png`: assinatura azul da marca, slogan "O céu de cada cidade" e céu noturno original com nuvens/estrelas. Open Graph e Twitter usam a mesma URL absoluta e dimensões reais 1731×909. O arquivo antigo permanece para links já armazenados; novas artes devem receber outro nome para distinguir o cache externo. A prévia não entra no precache nem é baixada pela Home. Serviços como WhatsApp mantêm cache próprio de previews; publicar não garante atualizar mensagens antigas.

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

Cadastro, recuperação e OAuth usam `socialAuth.redirectTo(location, flow)` para retornar ao domínio público, mesmo iniciados em previews protegidos. Somente localhost/127.0.0.1 preservam origem local; não voltar a usar location.origin para retornos de produção. Site URL e Redirect URLs hospedados precisam acompanhar esse contrato: frontend/config.toml não os alteram. `scripts/verify-auth-redirects.cjs` confere os destinos com token inválido, sem e-mails/contas; `verify-auth-redirects.py` usa SDK e sessões fictícias em Chromium/WebKit. Nunca imprimir fragmentos de sessão ou liberar Vercel Authentication para corrigir o retorno.

`inmetArea`/`selectInmetAlerts` aceitam cidade opcional; `modules.alerts.forCity` reaproveita a leitura nacional, com freshness/indisponibilidade. Não buscar INMET por favorito nem duplicar matcher. Região explícita conflitante impede fallback por nome único. O relógio central notifica cards abertos; não adicionar timer/fetch por card.

Cards INMET separam severidade, condição, status temporal, riscos, área e validade. `data-stage` usa active/future/unconfirmed e stale na leitura anterior; nunca mostrar essa leitura como confirmação atual. Preserve ordem/severidade/horários e links oficiais calculados em app.js. Superfícies suavemente tingidas não usam blur nem animação de perigo; texto comum continua branco/cinza e a severidade conserva sua cor. `#alertDetail` reutiliza o modal compartilhado: título fora de `#alertDetailBody.dialog-scroll`, períodos lado a lado e texto completo de riscos/recomendações, inclusive em telas pequenas. Não cortar municípios/recomendações para caber no card.

`continuous.css` define pluvia-dialog-enter (de cima) para os diálogos existentes. `modules/dialog-motion.js` mantém top layer/foco até a saída para baixo terminar; X, backdrop e Escape usam esse controlador. Fechamentos por invalidação de cidade/dados continuam nativos e imediatos. Não atrasar remoção de dados antigos nem substituir `dialog.close` no protótipo. Reduced motion fecha imediatamente. Animar somente opacity/transform, sem medir layout em frames ou adicionar blur. `visual.yml` executa Chromium/WebKit e guarda screenshots; ver `docs/OPERATIONS-AND-QA.md` para limites, hardware e monitoramento. Não confundir QA com fixtures com autenticação/exclusão/envio real. Nowcast: ler `docs/NOWCAST-EVALUATION.md`; timestamps de 15 minutos interpolados não sustentam precisão de 15 minutos.

## PLUVIA Nowcast (piloto Manaus)

O piloto está pausado na interface por solicitação do usuário até completar as fontes observacionais necessárias. `#nowcastCard` tem data-enabled="false"; `mount` retorna um controlador inerte, sem cliente HTTP, listeners ou consultas. Não basta hidden: o renderer poderia reabrir o card. Não reativar automaticamente por query/localStorage. `verify-nowcast.py` primeiro testa pausa/ausência de requests e só habilita HTML de fixtures dentro do QA para preservar os cenários do motor. Backend, providers, documentação e testes continuam disponíveis para evolução futura.

Leia `docs/NOWCAST.md` antes de alterar o motor, cobertura ou habilitar qualquer fonte. A configuração única de regiões vive em `supabase/functions/_shared/nowcast/regions.js`; o endpoint sem query fornece capacidades ao frontend, sem consulta de sensores. A caixa do piloto não é a cobertura operacional do radar nem todo o polígono oficial da RMM.

`_shared/nowcast/providers.js` separa radar, estações, satélite, raios e modelos. A primeira fonte efetiva é METAR SBEG via NOAA AWC, buscada pelo servidor por ausência de CORS. METAR é observação **na estação e no horário do boletim**: ausência de RA não confirma tempo seco; VC não é chuva naquele ponto; TS não é evento geolocalizado de raio. Conservar obsTime, validUntil e qualidade; ingestão não renova a observação. Vento em nós é convertido, VRB permanece sem direção e ajuste do altímetro não vira pressão MSL.

SIPAM quantitativo ainda não está autorizado/integrado. Não criar scraping do SipamHidro nem inferir licença pelo acesso público. GOES GeoColor/RainViewer são visuais, sem interpretação de alpha/RGB como taxa ou temperatura. Preservar orçamento de raios; Nowcast não chama Xweather automaticamente. Previsão por modelo não participa do motor observacional.

`engine.js` valida grades mm/h, cobertura/qualidade, sequência e pelo menos três correspondências para movimento. Inferência linear experimental não é observação nem probabilidade calibrada; HIGH exige validação regional independente. Frames antigos, gaps/no-data, movimentos ambíguos e divergências reduzem confiança/suspendem ETA. IDs para alertas futuros precisam ser estáveis/persistidos; notificationCandidate prepara dedup/cooldown, sem envio real.

`dist/modules/nowcast.js` usa HTTP isolado, revisões A → B → A e refreshAll/relógio existentes. Não adicionar polling/timers por card. Cache é curto/em memória, resultados expiram, ETA é removido, estação preserva sua própria validade. Mapa reaproveita o snapshot e o Leaflet único, sem fetch extra. Endpoints públicos aceitam região cadastrada e referência municipal de até duas casas, sem URL arbitrária/usuário/credenciais. Cache regional/dedup no servidor são por instância, não lock global; expandir requer cache/lease compartilhados e contrato de fonte.

Mocks somente em `tests/support/nowcast-fixtures.cjs` + `scripts/nowcast-dev-server.cjs` loopback. Nunca colocar fixtures em dist/SW, habilitar allowMock no handler público ou expor cenário de desenvolvimento no endpoint. Cliente de produção rejeita mock:true; desenvolvimento mostra DEV / MOCK DATA. SW exclui também /api/ local.

Não criar tabelas de frames/células sem fonte real, retenção definida e justificativa. Não guardar GPS preciso em cache público. A publicação do backend deve preceder o frontend; até existir endpoint, capacidades falham e card permanece oculto. Novo QA: `python scripts/verify-nowcast.py` e variante PLUVIA_BROWSER=webkit, com fixtures, sete viewports, hora municipal, expiração, refresh e estação no mapa. Não chamar isso de validação com radar real ou hardware iOS.

## Umidade, partículas e faixa do conjunto

Umidade usa `weatherInsights.humidity` (faixas Defesa Civil/OMS, hora mais seca restante do dia municipal). PM2,5 de 24h vem do snapshot (`airQuality.pm25Mean24h`, 18 de 24 amostras) e `weatherInsights.particles` (OMS 2021); descreve concentração, nunca atribui fumaça/queimada. `modules/forecast-spread.js` consulta o conjunto ICON EPS diário somente ao abrir um dia, com cliente próprio, cache curto e invalidação por cidade; `daily-detail.js` só lê. Não mover essas consultas para a abertura da Home. Normais climatológicas pelo navegador estão fora: ver `docs/DATA-SOURCES.md`. Web Vitals seguem `docs/ANALYTICS.md`.

## Home compacta (outubro/2026)

A seção `#alertas` fica logo abaixo do hero, antes de Próximas horas. `data-alert-state` (`loading`/`clear`/`alerts`/`unavailable`) é definido por `setAlertState` em app.js; somente uma leitura atual e vazia vira `clear`, que o CSS compacta em uma linha (título só para leitores de tela). Leitura anterior ou falha nunca compactam como “sem avisos”. Com aviso, o card completo aparece no mesmo lugar. O convite de notificações fica depois dos 7 dias.

Visibilidade, umidade, vento e pressão são tiles `.metric-sky` em grade (2 colunas no celular, 4 no desktop) que ocupam quatro linhas via subgrid (rótulo, valor, nota, selo); tiles da mesma fileira compartilham essas linhas. UV e ar ocupam a largura toda. O gráfico por hora fica em `#hourlyChartDetails` (recolhido); “Ver previsão” o abre, e janela seca/frase de chuva continuam visíveis. Títulos de seção usam um único tamanho. `closeCitySearch` só devolve o foco à busca quando o diálogo estava aberto: o fallback sem localização não pode focar a lupa na abertura. QA de alinhamento mede as fileiras dos tiles e a linha única dos dias.

## Detalhe diário e estabilidade dos frames

`modules/daily-detail.js` consome o snapshot central e `city-time.js`; não faz requests ou polling. As linhas diárias são botões nativos e abrem `dailyDetailDialog`, com a mesma paleta, viewport, área de scroll e motion dos outros diálogos. Horas reutilizam `hourlyDetail.detail` e o modal horário existente; a navegação daquele acesso fica dentro do dia. Totais/probabilidade são diários, vento/rajadas são máximos dos horários disponíveis. Ausência/recorte são explícitos. Solar vem de `PLUVIA.sky.dayAt` na data municipal selecionada. Refresh mantém nós/foco/scroll; cidade nova fecha ambos. Não reintroduzir planejador, resumo removido ou Nowcast. Ver `docs/DAILY-DETAIL-AND-RADAR.md`.

No mapa, somente tiles entregues confirmam frame e horário; `load` sem `tileload` não é sucesso. Timeout de dez segundos, falha parcial e retry por gesto mantêm a imagem anterior corretamente identificada. Frames cancelados não podem completar depois. Repetir frame não cria layer, metadata de radar tem TTL de dois minutos e resize usa um rAF compartilhado, só invalidando dimensões alteradas. Não medir isso como ganho de FPS/bateria sem profiling físico. Status parcial também expira.

QA adicional: `verify-daily-detail.py` (sete viewports, fuso diferente, dados parciais/salvos, foco e modal horário compartilhado) e `verify-contrast.py` (amostras de textos em nove fundos, incluindo intro). Ambos rodam no Chromium e WebKit da CI. Testes de contraste amostrado não certificam acessibilidade integral.

`pages.yml` agora executa `check-release.cjs` depois do deploy (hashes públicos do shell) e o smoke de `verify-visual.py`, em `PLUVIA_PUBLIC_SMOKE=1`. Este usa a URL pública e fixtures, bloqueia métodos diferentes de GET e APIs externas reais. Não reportar isso como teste de conta, Push, radar real ou hardware iOS. Falha pós-deploy deve ser investigada; não há rollback automático.
