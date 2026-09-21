# Fundação e alertas — 10/09/2026

## Organização compatível

`dist/modules/sources.js` define PLUVIA.modules e o registro compartilhado. `adapters.js` oferece fachadas weather, alerts, location, air-quality, disasters, auth, map, weather-layers e ui, reaproveitando as funções de app.js/p0.js. O estado continua único; não há segunda instância de autenticação ou clima. `risks.js` contém regras puras, apresentação de riscos e detalhes de avisos. `account.js` mantém Supabase isolado. Não há nova biblioteca nem build obrigatório.

`dist/modules/weather-data-layer.js` é a fronteira canônica entre provedores e novos recursos. O adaptador Open-Meteo normaliza localização, fonte, fuso, unidades, condição atual, séries horárias/diárias e qualidade do ar; mantém o payload bruto somente como ponte de compatibilidade para os componentes legados. Novos recursos devem consumir `PLUVIA.weatherData`, não interpretar nomes de campos do provedor. A migração da UI é incremental para não quebrar a Home em produção.

weather-layers carrega o mapa somente sob demanda. Chuva usa frames observados do RainViewer; satélite usa NASA GIBS com data explícita; nuvens usa estimativa Open-Meteo em nove pontos. Cemaden, focos de calor e raios permanecem apenas registrados como provedores preparados, sem fetch nem dado exibido, porque nenhum endpoint público estável para o navegador foi validado.

## Contrato das fontes

name, type, kind (`official`/`estimate`), cityId, dataAt (instante do dado, ou null quando não informado), checkedAt (consulta bem-sucedida), status (`idle`, `loading`, `ready`, `stale`, `error`, `unsupported`), ttl. Nunca apresentar horário de consulta como horário de emissão. INMET não fornece horário de emissão uniforme no envelope utilizado: manter null; início/fim pertencem ao aviso. Metadados meteorológicos são convertidos pelo fuso municipal. Estados antigos expiram em 10 min e são limpos na troca de cidade.

## Risco: regra do produto, não classificação oficial de desastre

Somente aviso vigente, com início/fim conhecidos e município incluído, entra no índice oficial. Amarelo=1, laranja=2, vermelho=3. Aviso só estadual aparece nos detalhes, mas deixa abrangência incerta e não é promovido a alerta local. Campos ausentes não são inventados. Expirados são excluídos; futuros permanecem como previstos.

US AQI modelado >100 gera atenção e >200 risco elevado; não gera risco extremo. O índice usa o maior nível, preservando o aviso oficial na lista. INMET, clima e ar precisam estar disponíveis e recentes para permitir risco baixo. Ausência de dados ou abrangência incerta significa monitoramento incompleto, inclusive quando há um risco conhecido. Esse índice não cobre todos os desastres; notícias municipais não são convertidas em alarmes. Riscos de calor, chuva, tempestade/inundação etc entram por aviso oficial, sem dedução de ocorrência a partir de uma manchete.

## Performance e PWA

Capitais já locais; nomes de municípios e chunks por UF continuam sob demanda. GPS usa catálogo completo apenas quando necessário. Mapa existente continua sob clique; SDK Supabase fixado em 2.116.0 carrega para restaurar a sessão na abertura, preservando a correção recente de conta. Clima mantém snapshot municipal e atualização de 5 minutos; fetch com AbortController e timeout; respostas de HTTP com erro não vão ao cache. Sem cache compartilhado de Auth/APIs externas no SW.

SW core-69 precacheia somente shell local e módulos pequenos; Leaflet, tiles e frames meteorológicos não entram no precache e só são solicitados ao abrir o mapa. Limpeza apenas de caches pluvia-, scripts com prioridade de rede e versão única. Não serve HTML como se fosse imagem/script ausente. O manifest usa ícones dedicados 192×192 e 512×512 com fundo branco e símbolo PLUVIA azul, além de versões maskable 192×192 e 512×512 com área segura. Apple touch icon e favicon derivam do mesmo master 1024×1024. A instalação ainda depende do suporte de cada navegador. iOS: compartilhar → adicionar à tela de início quando suportado.

O snapshot meteorológico por município é exibido imediatamente em visitas seguintes e vale no máximo 36 horas, sempre com o horário do dado e indicação explícita de leitura salva. Previsão e ar degradam separadamente: se o ar falhar, a previsão nova continua sendo exibida e a última leitura de AQI só permanece com aviso de que não houve confirmação atual. Erros HTTP permanentes não geram repetição automática; timeout, falha de rede, 429 e 5xx permitem uma única nova tentativa da previsão.

### Contrato meteorológico core-65 — 21/09/2026

Antes de renderizar ou gravar cache, a camada `weather-data-layer` valida o objeto atual e o alinhamento integral das séries horárias e diárias pedidas pelo PLUVIA. As próximas 36 horas e os primeiros sete dias precisam estar completos; `null` fora do horizonte usado pela interface continua como ausência, sem virar zero. Datas, números, faixas percentuais, precipitação, vento, pressão e eventos solares inválidos rejeitam a resposta; string e booleano nunca são convertidos em medição. AQI é validado separadamente: falha do ar não impede a previsão válida.

As falhas de transporte possuem códigos internos distintos (`cancelled`, `timeout`, `rate_limited`, `invalid_response`, `network_error` e erro HTTP/provider). Trocar a cidade cancela a consulta anterior sem acionar retry; timeout e falha temporária continuam elegíveis para uma única nova tentativa. A tendência de pressão só descreve “últimas 3h” quando existem duas leituras finitas realmente separadas por três posições horárias.

No core-67, `modules/http-client.js` passou a ser o cliente compartilhado das consultas da Home: clima, AQI, avisos, comunicados e mapa modelado usam a mesma classificação de erro, timeout e registro de requests ativos. A troca de cidade chama `abortAll`, impedindo que uma consulta antiga gere retry ou sobrescreva o local atual. O módulo é independente do DOM e possui testes diretos.

No core-68, as camadas do mapa receberam uma instância HTTP própria e cancelam a consulta ativa na troca de camada ou no fechamento. O probe do radar consulta os metadados pela mesma infraestrutura, mas mantém um `AbortController` externo porque o ciclo completo também inclui o download e a leitura do tile de imagem. Assim, timeout, fechamento e troca de cidade cancelam metadados e imagem como uma única operação, sem compartilhar cancelamento com a Home.

No core-69, `modules/weather-services.js` passou a concentrar endpoints, parâmetros e construção de URLs dos providers usados pela Home. `WeatherService`, `AirQualityService`, `AlertService` e o adaptador da Defesa Civil delegam transporte ao cliente HTTP comum. `app.js` deixou de conhecer URLs de Open-Meteo, CAMS, INMET e Prefeitura de Manaus; ele mantém somente retry de produto, validação, cache e apresentação. A grade modelada de precipitação também foi movida para o serviço meteorológico.

Rollback: reverter o commit desta versão e restaurar conjuntamente os módulos alterados, referências versionadas do HTML e o identificador anterior do cache do service worker. Não reverter somente o identificador do cache, pois isso pode misturar shell e contrato de versões diferentes.

## PLUVIA Sinal

`dist/modules/signal.js` contém a regra pura do produto. Ela recebe dados já normalizados, estado das fontes e severidade oficial; não acessa DOM nem faz consulta externa. A saída mantém `level`, `label`, `summary`, `factors`, `confidence` e `score`.

- 🟢 Pode sair: sem chuva relevante, rajada forte ou aviso oficial confirmado.
- 🟡 Fica atento: chuva provável, calor/UV/ar relevantes ou monitoramento oficial incompleto.
- 🟠 Melhor esperar: alerta laranja, trovoada possível, chuva volumosa ou rajada forte.
- 🔴 Condição perigosa: alerta vermelho ou combinação modelada de alta severidade.

Aviso oficial confirmado tem prioridade. Ausência de resposta do INMET nunca vira sinal verde. A interface mostra “Por que este sinal?”, fatores, confiança e horário do modelo. O sinal é do município, não da rua.

## Verificação e limites

Suíte Node cobre conta/nome/logout com SDK simulado, geolocalização negada, troca manual, GPS atrasado, homônimos, múltiplos avisos, data expirada/futura, severidade, envelope inválido, falha de rede, stale, isolamento por cidade, AQI e reset de fontes. Fixtures são sintéticas e ficam só em tests/.

O preview supervisionado falhou: projeto estático sem package.json/servidor compatível. Mobile, desktop e login real em navegador NÃO foram executados. Manter QA manual: 393px e desktop; entrar/sair; busca teclado; Manaus/Parintins/São Paulo; negar GPS; desligar API; clicar detalhes e fechar via Escape; atualização SW e offline. Não foi possível validar CORS e resposta ao vivo do INMET/portal Manaus a partir deste ambiente. Não se promete que ausência de avisos equivale a ausência de perigo.

Revisão de vigência: cards e índice reavaliados a cada minuto e ao retornar à aba. Detalhes indicam aviso futuro, encerrado ou leitura sem confirmação atual. AQI ausente/inválido impede declarar risco baixo.
