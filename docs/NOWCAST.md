# PLUVIA Nowcast: piloto de Manaus

Pesquisa e implementação em 03/10/2026. **Não há radar quantitativo SIPAM integrado nem estimativa operacional de chegada da chuva em produção.** O primeiro adaptador real consulta boletins METAR do aeroporto Eduardo Gomes. A infraestrutura, o motor experimental e o modo de desenvolvimento permitem evoluir sem renomear uma probabilidade de modelo como observação.

## Estado encontrado e decisões

O frontend é vanilla JS estático em `dist/`, publicado pelo GitHub Pages. `app.js` coordena cidade, cancelamento e atualização; os módulos usam `PLUVIA`. Supabase/Deno já atende conta, MET Norway, resumos, raios e Web Push. Não criamos outro backend, cliente Auth, banco de preferências, biblioteca cartográfica ou cálculo astronômico.

Já existiam previsão por hora/dia, janelas de chuva por modelos, RainViewer com reprodução de sete frames, satélite GOES-East GeoColor via NASA GIBS e raios Xweather sob demanda. O HTML não oferecia os seletores de satélite/raios, embora seus carregadores permanecessem no mapa. A nova navegação recupera esses controles. RainViewer e GeoColor continuam **visuais**: não extraímos precipitação de cores/alpha, temperatura Kelvin de RGB nem trajetórias de tiles.

Não havia um motor observacional de deslocamento, provider quantitativo SIPAM ou série de estações normalizada. O METAR passa a aparecer em um card discreto junto da previsão horária/mapa e numa camada pontual no **mesmo Leaflet**. Não consulta cada favorito nem solicita GPS adicional.

### Etapas e limites da entrega

| Fase | Resultado |
| --- | --- |
| 1: auditoria/pesquisa | Arquitetura, contratos existentes e fontes oficiais revisados. |
| 2: providers/motor | Cinco responsabilidades independentes; esquema versionado, timeout e testes. |
| 3: primeira observação real | NOAA AWC / SBEG, endpoint efetivamente consultado. |
| 4: proximidade/movimento | Motor experimental testado com grades sintéticas, sem validação regional com radar real. |
| 5: UI | Card separa OBSERVADO, INFERÊNCIA e previsão tradicional; suspende ETA expirado. |
| 6: radar/mapa | Controles existentes recuperados e estação adicionada. **SIPAM e trajetórias não habilitados**. |
| 7: enriquecimento | GOES GeoColor/raios existentes preservados. Slots para dados quantitativos preparados; nenhuma nova chamada Xweather. |
| 8: QA/documentação | Testes Node, Deno, navegador e documentação; resultados ao fim deste documento. |

## Fontes pesquisadas e contratos confirmados

### Censipam / SIPAM — prioridade para a próxima integração

Páginas oficiais consultadas:

- [Infraestrutura tecnológica do Censipam](https://www.gov.br/censipam/pt-br/atuacao/copy_of_infraestrutura-tecnologica): lista 11 radares, quatro no Amazonas, alcance nominal meteorológico de 240 km e vigilância de 400 km. Página histórica, não comprova saúde/cobertura operacional atual. Aponta para [S.O.S. Manaus](http://sosamazonia.sipam.gov.br/sosmanaus/).
- [Aplicativo Radares da Amazônia — SIPAM](https://www.gov.br/pt-br/apps/radares-da-amazonia-sipam): visualização em tempo real, sem contrato público de API de radar nessa página.
- [Radar SipamHidro](https://hidro.sipam.gov.br/radar/): aplicação oficial de visualização; a presença de uma interface de taxa de chuva não comprova acesso autorizado à sua grade.
- [Swagger oficial de meteorologia](https://panorama.sipam.gov.br/api/meteorologia/v1) e [OpenAPI JSON](https://panorama.sipam.gov.br/api/meteorologia/v1/docs?api-docs-meteorologia-v1.json): ambos retornaram HTTP 200. O JSON declara base `/api/meteorologia/v1`, endpoints de previsão e EMS, **nenhum endpoint de radar** nessa especificação.

Rotas EMS documentadas: `GET /ems/estacoes`, `GET /ems/dados_atuais`, `GET /ems/dados/ultimo/{estacao_id}`. Exigem query `token`; o último exige `estacao_id`. `POST /token` documenta `cod_organizacao`, `chave_1`, `chave_2`. Não tentamos obter token nem chamamos essas rotas autenticadas. Unidades, timezone, flags de qualidade, cadência e direitos de reutilização ainda precisam ser confirmados com um payload autorizado; nomes de campos não bastam para normalização.

O [artigo técnico sobre radar no SipamHidro](https://sol.sbc.org.br/index.php/wcama/article/download/6434/6330/) descreve processamento Radx2Grid, CAPPI/refletividade, precipitação/VIL, arquivos MDV e imagens. Menciona ciclos de **12 minutos** e alcance de 240 km. São características da implementação histórica descrita no artigo, **não uma frequência atual contratada ou verificada**.

Não foi validado um contrato autorizado para WMS, WMTS, tiles, GeoJSON, grades georreferenciadas, resolução espacial, refletividade quantitativa, Doppler, timestamps/varreduras ou retenção histórica do radar de Manaus. Isso não significa que esses serviços não existam. Não inventamos URLs nem construímos scraping do portal.

**Condição de uso relevante:** o [termo oficial SipamHidro](https://hidro.sipam.gov.br/termo-uso), acessível pela aplicação pública, afirma: “O simples acesso ao sistema não confere aos usuários qualquer direito ao uso dos [...] imagens, dados e informações [...]” e “É vedada a utilização do sistema para finalidades comerciais, publicitárias [...]”. Acesso visual público não equivale a autorização de redistribuir dados no PLUVIA. Antes da integração, obter confirmação institucional de finalidade/licença, feed e parâmetros de uso. Nenhuma credencial SIPAM foi adicionada.

### Primeira fonte integrada: NOAA Aviation Weather Center / METAR

- [Documentação da API oficial](https://aviationweather.gov/data/api/).
- [OpenAPI oficial](https://aviationweather.gov/data/schema/openapi.yaml), HTTP 200.
- **Endpoint realmente consultado:** `https://aviationweather.gov/api/data/metar?ids=SBEG&format=json`, HTTP 200 com boletim de Manaus. A estação SBEG é o aeroporto Eduardo Gomes.

`obsTime` é Unix em segundos, `temp/dewp` Celsius, `wspd/wgst` nós, `wdir` graus ou `VRB`, `altim` ajuste do altímetro em hPa. O provider converte nós para km/h e mantém vento variável sem inventar direção. `altim` **não** é pressão ao nível do mar. `wxString` descreve o tempo presente reportado; não calculamos volume de chuva a partir dele.

METAR costuma ser horário; SPECI pode trazer um boletim especial, sem periodicidade garantida. A documentação oferece até 30 dias e informa limites de 100 requests/minuto e 400 registros. Esta implementação pede somente o boletim mais recente de uma estação, com cache de cinco minutos; não faz backfill. CORS não é permitido na API AWC, justificando o proxy no backend. Envia User-Agent identificando PLUVIA.

Consulta real local em 03/10/2026: boletim `obsTime=1790996400` (03:00 UTC), `wxString=-TSRA`, temperatura 25 °C, vento variável de 2 nós. O normalizador conservou o instante original, reportou chuva fraca/trovoada **na estação** e o motor retornou `INSUFFICIENT`, `mock:false`, `inference:null`. Esta consulta confirma acesso ao serviço, não habilidade de prever chuva por bairro nem disponibilidade futura.

Um único aeroporto não representa toda Manaus/RMM. `RA/DZ`, intensidade e `TS` são relatos qualitativos; `VC` significa proximidades, sem distância fixa. Ausência de token de chuva é `not_reported`, **não confirmação de tempo seco**. `TS` não é uma detecção geolocalizada de descarga elétrica. Qualidade é `unverified_station_report`; não validamos independentemente o sensor. Campos opcionais inválidos ficam nulos. Um boletim com identidade/tempo/coordenadas inválidos falha; observações acima de 90 minutos são descartadas, nunca renovadas pelo horário da consulta.

API pública oficial usada conforme documentação de acesso automatizado, com atribuição NOAA AWC. Não presumimos que todos os feeds de radar ou redes de terceiros tenham a mesma licença.

### GOES / CPTEC / NOAA

[Portal de satélites CPTEC/INPE](https://satelite.cptec.inpe.br/) consultado com produtos GOES-19 e aviso de instabilidade temporária. Links oficiais de visualização confirmados:

- `https://satelite.cptec.inpe.br/repositoriowebdsa/ultimas/ULT_CH13_RGB_2.jpg` (infravermelho).
- Na mesma pasta: `ULT_CH9_2.jpg`, `ULT_CH8_2.jpg` (vapor d’água), `ULT_CH7_2.jpg`, `ULT_CH2_GRAY_2.jpg`.
- `https://satelite.cptec.inpe.br/repositoriowebdsa/ultimas/ult_glm.jpg` e `ult_fortracc.jpg`.
- [SIGMA raios](https://sigma.cptec.inpe.br/raio/), [ForTraCC](https://sigma.cptec.inpe.br/fortracc/), [Nowcasting CPTEC](https://nowcasting.cptec.inpe.br/).

Esses links fornecem painéis/imagens, não um contrato de pixels Kelvin, células ou eventos GLM normalizados para nosso motor. Não usamos uma paleta de JPEG como medida de resfriamento. Cadência, atraso e permissão de uso dos produtos específicos precisam de confirmação.

[NOAA GOES Open Data, registro oficial](https://registry.opendata.aws/noaa-goes/): buckets `noaa-goes19`, `noaa-goes18` e históricos 16/17, sem conta AWS para acesso público. [Metadados NCEI de ABI-L2-ACHT](https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ncdc:C01507) documentam temperatura de topo em Kelvin e grade de 2 km com qualidade. É necessário selecionar produto/domínio que cubra Manaus, processar NetCDF/HDF5, projeção geostacionária, flags e calibração num worker. Não adicionamos download de arquivos de disco completo ao navegador nem um parser improvisado.

O GOES-East GeoColor já usado no mapa via NASA GIBS continua funcionando; seu domínio temporal informa `PT10M` e o mapa limita sete imagens das últimas seis horas. Não garante que uma imagem com nuvens represente precipitação no solo. O provider novo permanece `visual_only`, sem promover RGB a detecção convectiva.

### Descargas atmosféricas

Vaisala Xweather já fornece pontos de raios no serviço `/lightning`: janela de cinco minutos, raio de 40 km, cache de cinco minutos e teto atômico de 150 consultas/mês, com custo multiplicador ×10. O Nowcast **não** chama esse serviço automaticamente nem consome esse orçamento. A camada existente permanece sob demanda. Seu slot fica `on_demand` até um contrato de enriquecimento compartilhado ser validado.

GLM GOES e imagens CPTEC foram pesquisados, sem ingestão de eventos real nesta etapa. Não alegamos cadência/resolução operacional GLM não verificada. Os efeitos estéticos de tempestade permanecem decorativos, independentes de qualquer detecção de raio.

### INMET, Cemaden e redes locais

[Estações automáticas INMET](https://portal.inmet.gov.br/servicos/esta%C3%A7%C3%B5es-autom%C3%A1ticas): informações horárias/últimos 90 dias, com visualização em `https://tempo.inmet.gov.br/TabelaEstacoes/`. Catálogo identifica Manaus A101; acesso direto ao catálogo apresentou indisponibilidade durante a pesquisa. Não foi validado um contrato aberto estável de leitura automática nessa investigação. INMET existente no PLUVIA é de **avisos oficiais**, não de estação; não tratamos avisos como precipitação medida.

[Cemaden, mapa oficial](https://mapainterativo.cemaden.gov.br/): não validamos endpoint público documentado, timestamp/unidades e autorização para redistribuição automática. Não fazemos scraping. A API EMS Censipam citada acima é outro caminho, porém autenticado. Temperatura, umidade, pressão, vento, rajadas e acumulados locais exigem um provider com contrato confirmado.

## Arquitetura e contrato

```text
RadarProvider (aguarda feed autorizado)        SatelliteProvider (visual_only)
WeatherStationProvider (AWC real)              LightningProvider (on_demand)
ForecastProvider (context_only, modelo excluído)
                         ↓
       coleta independente + cache por região
                         ↓
                NowcastEngine (puro)
                         ↓
       NowcastResult v1: observation / inference / stations / sources
                         ↓
          cliente isolado → card + mapa existente
```

Código central: `supabase/functions/_shared/nowcast/`. `regions.js` é a configuração única de regiões no servidor. `GET /functions/v1/nowcast` sem query devolve capacidades públicas (schemaVersion, regiões e bounds), sem consultar sensores. Frontend não duplica caixas de cobertura. `GET ?region=manaus&lat=-3.12&lon=-60.02` avalia a referência municipal. Apenas GET/OPTIONS, regiões cadastradas e coordenadas com até duas casas; sem URL de provedor, usuário, credenciais ou modo mock no request. O endpoint é público (`verify_jwt=false`), com CORS restrito aos domínios existentes/loopback.

Cada provider entrega `id`, `type`, `kind`, `status`, `source`, `observedAt`, `ingestedAt`, `reason` e seu payload normalizado. Coleta em paralelo com deadline de oito segundos por provider, AbortController e limpeza de timers. Falha, timeout, 429 e JSON inválido têm razões distintas; não registramos payloads, URLs privadas ou posições de usuários. As estações trazem `validUntil` e qualidade. Resultados trazem `schemaVersion`, `evaluatedAt`, `validUntil`, confiança e separação explícita de `observation`/`inference`.

Região inicial: caixa de piloto Manaus/entorno (`-3.7..-2.5`, `-61.2..-59.2`). **Não é polígono oficial da Região Metropolitana nem máscara operacional do radar.** Município é ponto de referência, não localização exata do usuário. A cobertura válida de radar vem da grade/qualidade do feed futuro; não inferir a cobertura atual a partir do alcance nominal de um radar.

## Motor experimental

Contrato para radar futuro: uma a seis grades consecutivas EPSG:4326, linhas de norte para sul, precipitação quantitativa **mm/h**, dimensões 3..128, mesmas dimensões/bounds. Cadência de cada intervalo entre 3 e 20 minutos. No-data é `null`, nunca zero. Converter dBZ para taxa exige calibração/contrato do provider; o motor não assume relação Z–R.

1. Valida números, unidades, limites, monotonicidade e timestamps (tolerância futura de um minuto). Exige cobertura verificada e qualidade quantitativa em toda a sequência. Dados faltantes suspendem a análise.
2. Segmenta pixels ≥0,5 mm/h por vizinhança de quatro lados; exige quatro pixels por área e limita a 30 áreas. Intensidade média: fraca <2,5, moderada <7,5, forte ≥7,5 mm/h. São limiares internos experimentais, não classificação oficial SIPAM. Podem omitir células pequenas e exigem validação tropical.
3. Calcula proximidade à borda aproximada dos pixels, centróide e taxa média. Coordenadas convertidas em plano local; não é projeção cartográfica para operação nacional.
4. Associa áreas entre frames por distância e área, rejeitando competição, ambiguidades, divisões/fusões detectáveis. Movimento exige pelo menos três correspondências. Limite 100 km/h; segmentos consistentes (erro relativo ≤35%); <3 km/h em todos os segmentos significa pouco deslocamento.
5. Advecção linear dos pixels, corrigida pela idade do último frame. Interseção aproximada com a referência produz faixa de chegada arredondada em cinco minutos, incerteza mínima de dez minutos e horizonte máximo de 120. Não indica um minuto exato de início. Direção é **para onde** a área se desloca, diferente de vento meteorológico **de onde** sopra.
6. Projeta centróides para 15/30/45/60/90/120 minutos. Horizontes >60 têm confiança baixa. Não extrapola nascimento/desaparecimento de células.

Novo eco em sequência antes vazia produz `FORMING`, com inferência de **possível** formação ou entrada na cobertura, sem velocidade/ETA. Intensificação/enfraquecimento compara taxas médias dos frames associados, não confirma tempestade/raios. Sem eco significativo, a frase limita-se à cobertura e ao horário da observação; não promete uma próxima hora seca.

### Confiança

Heurística auditável, **não probabilidade estatisticamente calibrada**. Considera idade, quantidade de frames, consistência, distância e resolução. Quanto mais antigo o radar, menor score; idade >10 minutos ou pixel muito largo limita a LOW. Último frame >15 minutos torna os dados insuficientes. Uma estação com chuva reportada há menos de dez minutos num pixel seco cancela ETA e impede ausência de chuva confiante.

HIGH somente se o adaptador receber habilitação explícita após **validação regional independente** (`quality.calibrated=true`); o provider atual nunca habilita isso. Sem validação, máximo MEDIUM. Raios/temperatura do topo quantitativos ainda não são entradas do score, porque esses contratos não foram integrados; não fingimos concordância multissensor. Futuro enriquecimento deve exigir tempo, geografia, qualidade e associação à célula, com testes independentes.

Sem radar válido, resultado é `INSUFFICIENT`, LOW e “Dados insuficientes para um nowcast confiável neste momento.” Estações recentes continuam visíveis. Previsão de modelo é somente contexto; probabilidade de chuva jamais cria um eco, melhora score ou gera ETA.

## Cache, atualização, falhas e armazenamento

- Backend: cache por região de cinco minutos, falha sem estação válida por um minuto; dedup de chamadas simultâneas **na instância**. Resultado HTTP max-age/s-maxage de 60 segundos, capacidades de uma hora. Timestamps originais sempre preservados.
- Não existe garantia de lock global entre instâncias. API limitada regionalmente e uma estação reduzem custo inicial, mas expansão/tráfego elevado exige cache/lease compartilhados e quota para a fonte. Não alegar que memória/CDN eliminam toda consulta duplicada em cold starts.
- Frontend: cliente HTTP próprio, separado de forecast/mapa. Atualização pelo `refreshAll` central, revalidação em reconexão/background existentes e botão explícito. Sem polling por card, favoritos ou novos timers. Cache em memória de até dez referências; sem persistir inferências offline.
- Troca de cidade invalida revisão e signal, inclusive A → B → A. Respostas anteriores não repintam uma seleção nova. Revalidação mantém dados da mesma cidade; tempo expirado remove ETA imediatamente no relógio central. Estação permanece histórica até 90 minutos, com data/idade explícitas. Fora do piloto o card fica oculto e não consulta sensores.
- Service worker precacheia somente o código novo; APIs externas e `/api/` local são excluídos. DEV fixtures não estão em `dist/` nem no precache.
- Nenhuma tabela/migration: último METAR e cache curto não justificam armazenamento permanente. Para radar real serão necessários histórico rotativo de frames normalizados e identidade persistida de células; só então decidir objeto/storage, TTL, esquema/RLS/cron existentes e limites. Não guardar GPS preciso em tabelas públicas.

## Desenvolvimento e alertas futuros

Abrir o preview estático:

```sh
node dist/dev-server.cjs --host 127.0.0.1 --port 4173
```

Em outro terminal, servidor **somente loopback**:

```sh
node scripts/nowcast-dev-server.cjs --scenario approaching
```

Abrir `http://127.0.0.1:4174`. Cenários: approaching, dry, stationary, away, forming, intensifying, radar-down, stale, discordant, outside, no-location. Fixtures ficam em `tests/support/nowcast-fixtures.cjs`. Card recebe `mock:true` e mostra **DEV / MOCK DATA**. `--live --port 4175` consulta somente AWC real, sem radar simulado. Em rede com proxy Node pode exigir `NODE_USE_ENV_PROXY=1`; não desabilitar TLS.

Motor de produção recusa mock por padrão; handler força essa política e não aceita parâmetro mock/scenario. Frontend aceita mock somente em `http://localhost` ou `http://127.0.0.1`; domínio de produção recusa mesmo que o servidor responda errado. `allowMock` explícito pertence exclusivamente ao harness/testes, nunca ao endpoint público.

`notificationCandidate` prepara deduplicação por ID estável de célula (seis horas) e cooldown regional (30 minutos). Requer tracking persistente, radar validado regionalmente, resultado vigente, confiança MEDIUM/HIGH e aproximação ≤60 minutos. Não envia Push, não registra inscrições nem altera o worker existente. IDs de centróide/index de frame não servem como identidade persistente. Storm/lightning alerts exigem detecções reais, não token TS do METAR nem animação estética.

## Próximos passos e critérios de habilitação

1. Solicitar ao Censipam feed e autorização para Manaus: produtos, projeção, unidades, timestamps, máscara/qualidade, resolução, varreduras atuais, histórico, limites, estabilidade e licença de redistribuição. Não habilitar com uma captura de tela ou endpoint deduzido do portal.
2. Adaptador normalizado + armazenamento rotativo de três ou mais frames reais. Rejeitar dados inconsistentes e monitorar saúde/idade sem posições pessoais nos logs.
3. Validar eventos tropicais contra pluviômetros/estações independentes: falsos negativos, erros de chegada, crescimento/dissipação, fusões e cobertura. Só após essa avaliação decidir limiares, confiança/ETA públicos e projeções visíveis no mapa.
4. Mostrar radar SIPAM no mapa quando georreferência/licença estiverem confirmadas, usando player existente, preload do próximo frame limitado, cache/TTL e cancelamento. Não sobrepor trajetória aos tiles RainViewer como se fossem a grade do motor.
5. Worker GOES-19 ABI/GLM quantitativo, com domínio Manaus, DQF, latência/custo verificados. Compartilhar eventos de raios existentes sem segunda consulta e com orçamento específico caso vire automático.
6. Estações INMET A101/Cemaden/EMS autenticada: contrato/unidades/tz confirmados, licença e dados recentes. Expandir cobertura por configuração, sem duplicar providers por cidade.
7. Persistência de células, cooldown e opt-in no sistema Push existente; validação de notificações antes de enviar qualquer alerta Nowcast.

## Validação desta etapa

Os testes de regras cobrem: sem ecos; chuva estacionária/aproximando/afastando; novo eco; intensificação; radar indisponível/atrasado; satélite indisponível; fontes discordantes; fora da região/grade; localização ausente. Também timestamps/valores inválidos, frames insuficientes, mudança brusca de movimento, mock recusado, exclusão de modelos, cache/dedup/timeout, CORS, precisão limitada, refresh silencioso, expiração de ETA e troca A → B → A.

Comandos disponíveis:

```sh
node --test tests/*.test.cjs
for file in dist/*.js dist/modules/*.js dist/vendor/*.js supabase/functions/_shared/nowcast/*.js scripts/nowcast-dev-server.cjs dist/dev-server.cjs; do node --check "$file" || exit; done
deno check supabase/functions/*/index.ts supabase/functions/met-forecast/index.js supabase/functions/lightning/index.js
python scripts/verify-nowcast.py
PLUVIA_BROWSER=webkit python scripts/verify-nowcast.py
```

`verify-nowcast.py` usa fixtures isoladas, sete viewports, relógio municipal com dispositivo em Asia/Tokyo, seleção de estação no Leaflet real, cache/falha de atualização e supressão de ETA expirado. Bloqueia serviços de conta, sensores e Push; o único download externo do teste é o SDK Leaflet 1.9.4 existente. Screenshots são artefatos de revisão, sem baseline de pixels entre sistemas diferentes. Ver também os QA existentes de painel, conta e estados visuais.

O projeto não possui lint, tsconfig frontend ou comando de build: artefato de produção é `dist/` estático. Deno verifica tipos do backend. Não alegar sucesso de lint/build inexistentes, radar real, notificações, rede móvel ou hardware iPhone a partir desses testes. Os resultados finais estão registrados na seção de entrega abaixo.

### Entrega e resultados verificados (03/10/2026)

- **327 testes Node passaram**, contra baseline de 291; 36 novos testes específicos do Nowcast. Sintaxe de todos os JS publicados/vendor e código novo verificada. Deno 2.5.0 verificou todas as funções Supabase, incluindo `nowcast`, sem erros.
- **Chromium e WebKit**: QA do Nowcast passou em sete viewports (320×568, 375×667, 390×844, 430×932, 844×390, 768×1024 e 1440×900); cenários de radar/station fixtures, DEV label, expiração, refresh e estação no mapa. Detectamos e corrigimos overflow de 29 px no WebKit a 320 px: track implícito do grid expandia ao tamanho mínimo dos controles; track `minmax(0,1fr)`, limites de conteúdo e input range corrigem a causa.
- Os quatro QA existentes também passaram em **Chromium e WebKit**: painel/responsividade, sincronização de conta, ciclo de recuperação/exclusão com fixtures, estados visuais/reduced motion/diálogos. Sem alterações de contas reais nem envios de notificações.
- Consulta AWC real também percorreu **backend local → cliente → card**: novo boletim SBEG das 04:00 UTC de 03/10 retornou `rain:not_reported`, `thunderstorm:vicinity`; card manteve `mock:false`, `INSUFFICIENT` e nenhuma inferência. Não chamou isso de chuva ausente ou radar detectado.
- Não há lint/build frontend configurado; `dist/` é o artefato de produção estático. Validação backend executada pelo Deno. Diff revisado e sem erros de whitespace. Não há métricas de acurácia de radar real, entrega de Push nem teste em iPhone físico.
- **Sem deploy/merge em produção nesta etapa.** Acesso SIPAM, redistribuição e validação com frames reais continuam pendentes. Código fica em branch/PR de revisão. Antes de uma futura publicação, publicar a função e verificar capacidades/observações no ambiente hospedado, então coordenar frontend/SW. Habilitar ETA requer os critérios regionais acima.

### Arquivos

Criados: `dist/modules/nowcast.js`; `supabase/functions/nowcast/index.ts`; `_shared/nowcast/{regions,providers,engine,service}.js`; `scripts/nowcast-dev-server.cjs`; `scripts/verify-nowcast.py`; `tests/nowcast-{engine,service,client}.test.cjs`; `tests/support/nowcast-fixtures.cjs`; este documento.

Modificados: `dist/{index.html,app.js,continuous.css,weather-map.js,sw.js}`, `dist/modules/sources.js`, `supabase/config.toml`, `AGENTS.md`, `docs/{DATA-SOURCES,NOWCAST-EVALUATION}.md`, contratos de cache/shell/SW em testes e workflows de validação/QA. Não alteramos conta, favoritos, forecast, astronomia ou worker Push.
