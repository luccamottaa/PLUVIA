# Auditoria de estabilidade do PLUVIA — 2026-10-01

## Escopo e base estudada

Base: `main` em `ab0070e6766d7f8554ce32d31066aa074b94ea3b`. Trabalho local na branch `audit/pluvia-stability`. O repositório foi lido antes das alterações: entrada HTML, scripts/módulos, catálogo e carregamento de cidades, estilos finais, PWA, testes, workflows, funções e migrations Supabase, documentação e histórico recente.

O produto continua estático, com a mesma identidade visual e funcionalidades. Não houve migração de framework, nova dependência do app, mudança de domínio, publicação, alteração de dados de usuários ou migration de banco. Deno e ferramentas de navegador foram usados fora do repositório para validação.

## Mapa de arquitetura e dados

```text
catálogo/índice/UF -> escolha manual ou GPS -> activeCity + cityRevision
                                      -> services -> http-client
Open-Meteo forecast -----------------> validação -> app/render -> cards
CAMS --------------------------------> validação + idade própria -> AQI
MET Norway -> função/cache -----------> met-merge por horário -> previsão combinada
INMET -------------------------------> área + validade + severidade -> avisos
forecast + cidade + instante ---------> city-time + sky -> intro/home/card solar
SunCalc -----------------------------> posição lunar + moon-view/fase compartilhada
contexto meteorológico ---------------> resumo determinístico -> IA opcional validada
cidade ------------------------------> radar/mapa com cliente e revisão próprios
conta -------------------------------> favoritos/cidades salvas/preferências push
cron -> Supabase push-process --------> candidatos -> política/dedup -> Web Push
HTML + assets versionados -----------> SW -> shell offline -> GitHub Pages
```

`dist/` é a fonte publicada. Scripts clássicos compartilham estado lexical e `PLUVIA`; `p0.js` também estende a busca e os rótulos. Estilos atuais resultam da cascata `sky`, `styles`, `redesign`, `continuous`. Conta usa Supabase SDK local, enquanto serviços públicos são independentes da autenticação. Dados normalizados existem em `weather-data-layer`, mas parte da UI ainda consome arrays do provedor.

## Problemas encontrados, causas e correções

| Impacto | Problema confirmado | Causa raiz | Correção e proteção |
| --- | --- | --- | --- |
| Alto | Card solar, máxima/mínima e lista diária podiam continuar mostrando ontem após meia-noite | Índice diário `[0]` e renderização dependente da chegada de API | Seleção pelo calendário municipal atual; card e céu compartilham `sky.dayAt`; relógio avança data/hora/fase mesmo sem novo request |
| Alto | Conversões temporais duplicadas e frágeis em transições de offset | Offset inferido uma vez pelo dia, parsing implícito do dispositivo e formatters repetidos | `city-time.js` centraliza conversão por instante e calendário; valida datas impossíveis e DST inexistente; testes com fusos distintos |
| Alto | AQI antigo podia ter sua disponibilidade prolongada por sucessos da previsão | Cache renovava timestamp geral e reutilizava AQI sem verificar `airAt` | Idade independente, limite de 36h, metadados de fonte separados e indicação persistente de leitura anterior; redesenho não renova dados/favoritos |
| Alto | Resposta de IA antiga podia afetar contexto novo ou usuário diferente | Comparação com `context.contextHash` ausente, sem identidade completa da tarefa, hash omitia campos relevantes | Guardas por revisão, usuário, hash recalculado e controller; cancelamento em troca/logout; hash inclui códigos, probabilidades, rajadas e precipitação relevantes |
| Alto | Resumo podia chamar dados incompletos de condições estáveis | Conversão de `null`/strings em zero e janelas incompletas | Números estritos, janelas contíguas completas, resposta parcial honesta e validação de formato; função recusa agregados ausentes |
| Alto | Resumo e favoritos tinham janela de chuva diferente do gráfico/detalhe | Uso do índice inicial em dados cujo acumulado termina na hora informada | Chuva a partir de `i` usa `i+1`; testes com chuva anterior elevada e intervalo seguinte seco |
| Alto | Push oficial podia confirmar nomes parciais, ignorar geocode divergente e inventar validade | Substrings, fallback por nome apesar de códigos existentes e datas substituídas por `now + 6h` | IBGE autoritativo, nome exato com UF e validade real obrigatória; frontend também deixa de confirmar prefixos de cidade/estado |
| Alto | Falha do forecast impedia entrega de avisos oficiais já consultados | Um único bloco try dependia do sucesso de Open-Meteo antes de formar candidatos | Avisos oficiais independentes; falha da previsão é registrada sem impedir a política/entrega desses candidatos |
| Alto | Radar podia aceitar resposta da cidade anterior, inclusive fora da tela | Revisão/cancelamento só ocorria quando o mapa voltava a ser inicializado | Invalidação imediata da camada, cancelamento e limpeza dos frames/overlays em toda troca de cidade |
| Médio | Lua seguia sempre uma noite ilustrada, inclusive abaixo do horizonte real | Trajetória calculada apenas entre pôr e nascer do sol | Expõe posição existente em SunCalc e usa altitude/azimute municipais; fase/disco seguem compartilhados; testes percorrem 14 dias e a meia-noite |
| Médio | Timeout/cancelamento durante leitura do corpo aparecia como JSON inválido | Catch interno reclassificava `AbortError` | Preserva cancelamento/timeout durante body read e impede fetch com sinal já cancelado |
| Médio | Primeira previsão aguardava fontes opcionais por todo seu timeout | `Promise.allSettled` único para forecast, AQI e MET | Render inicial assim que há forecast válido, complementação posterior com guarda de cidade; IA aguarda os complementos |
| Médio | Requisições idênticas simultâneas podiam duplicar trabalho | Serviços delegavam cada chamada diretamente ao transporte | Deduplicação por URL/timeout/cache e invalidação de consultas ainda agendadas; sinais externos não compartilham cancelamento |
| Médio | Radar podia continuar reproduzindo fora da área observada e manter fades antigos ao trocar estado | Observer era desligado após primeira entrada; timers de fade não eram rastreados | Observer acompanha visibilidade, reprodução pausa, overlays em fade são removidos junto com a camada |
| Médio | Falha de reinicialização do mapa podia gerar tentativas contínuas | Retry em `finally` mesmo quando `initMap` falhava antes de atualizar cidade | Retry de cidade só após inicialização concluída; teste de erro garante uma tentativa |
| Médio | Dados salvos tinham status presente apenas para leitores de tela | CSS ocultava o status também no estado stale | Apenas o status de dados antigos volta a ficar visível, sem redesenhar o painel |
| Médio | Limite JSON de funções podia ser contornado sem Content-Length | Verificação somente do cabeçalho declarado | Leitura em streaming limita bytes reais a 24.000, inclusive com cabeçalho falso |
| Médio | Dois erros TypeScript no processador de push | Último elemento possivelmente ausente e array de códigos inferido como `never[]` | Narrowing explícito e tipo dos códigos; checagem Deno adicionada ao CI de PR |
| Médio | Resumo diário de push usava calendário UTC | Request diário em GMT, apesar de entrega no horário da cidade | Request usa timezone municipal, mantendo Unix time nos horários; intervalo de chuva também corrigido para o término real da API |
| Baixo | Argumento do servidor de preview podia assumir outro flag como host | `indexOf` retornava -1 e selecionava `args[0]` | Ausência de flag retorna undefined e usa o default correto |

Troca de cidade também limpa avisos INMET, badges de severidade, bússola e estado de IA, fecha o detalhe de alerta e invalida GPS/detalhes municipais pendentes. Uma nova busca ou geolocalização invalida a seleção lazy anterior. Escolher novamente a cidade atual cancela um GPS atrasado sem criar requests redundantes.

## Arquitetura

A centralização foi restrita a responsabilidades com bugs reais: tempo municipal, idade do cache e transporte. `app.js` continua coordenando a interface; não foi desmontado em componentes por estética. Hashes de IA foram alterados em frontend e função juntos; texto usa cache `copy-3` e hash `v2`. Função e frontend devem ser publicados de forma coordenada. Incompatibilidade mantém o resumo determinístico, mas impede aplicar IA.

`AGENTS.md` registra os contratos sensíveis, ordem dos scripts, responsabilidades, intervalo da chuva, fontes, viewport, estado e validações. Referências HTML/preload/precache foram sincronizadas e o SW passou à geração `pluvia-panel-46`.

## Performance

- Conversões e formatters de timezone têm caches limitados; merge MET calcula partes locais uma vez por ponto, reaproveitando-as nos agregados.
- Snapshots em memória têm limite de 30 cidades, alinhado ao limite de favoritos.
- Requests simultâneos iguais compartilham a mesma tarefa, com cancelamento correto.
- A primeira previsão não espera timeout de fontes opcionais; teste mantém AQI/MET pendentes e confirma que o forecast já está pintado.
- Relógio não redesenha todos os cards a cada tick: só em mudança de hora/data/fase ou expiração de AQI.
- Reprodução de radar para fora da área observada; nenhuma nova animação JavaScript por frame foi introduzida.

Não foram medidas métricas de Core Web Vitals, FPS, uso de GPU ou bateria. As melhorias acima são demonstradas por comportamento e pela remoção de trabalho redundante, sem estimar ganhos percentuais.

## Testes adicionados ou fortalecidos

Casos cobrem calendário municipal em três fusos do dispositivo, offsets explícitos, DST, datas inválidas, 23:59→00:00, dia atual do card solar, transição de fase dentro da mesma hora, Lua abaixo/acima do horizonte, reabertura e mudança de coordenadas; idade própria de AQI; cache legado; séries inválidas; corpo abortado; deduplicação e cancelamento antes do fetch; janelas parciais/chuva anterior; hash frontend/função; IA fora de ordem na mesma cidade, troca de cidade e logout; radar, overlays, pausa e falha de inicialização; cobertura/validade INMET; falha do forecast com push oficial; limite real do corpo JSON e carregamento progressivo.

Fixtures comuns vivem em `tests/support/forecast.cjs`. Testes antigos que travavam versões de assets foram atualizados junto com as referências. Fixtures que consumiam um módulo com nova dependência agora carregam essa dependência real. A expectativa antiga de chuva push 21h–23h foi corrigida para 20h–22h porque os valores de 21h e 22h encerram esses intervalos.

## Validação executada

- Sintaxe: `node --check` em 34 arquivos JS/CJS de entrada, módulos, vendor e preview, sem erros.
- Cada um dos 57 arquivos de teste executado diretamente: nenhum erro; 180 subtestes `node:test`, além das assertions dos scripts sem subtestes.
- `node --test tests/*.test.cjs`: 57 arquivos passaram; 0 falhas.
- `node --test --test-isolation=none tests/*.test.cjs`: 194 entradas passaram; 0 falhas, cancelamentos ou skips.
- `deno check supabase/functions/*/index.ts supabase/functions/met-forecast/index.js supabase/functions/lightning/index.js`: passou, incluindo dependências compartilhadas. O ambiente precisou usar o trust store do sistema para obter as dependências por proxy; não foi desativada validação de TLS.
- `git diff --check`: passou.
- Chromium/Playwright: página, conteúdo e console; sete viewports (320×568, 390×844, 430×932, 844×390, 768×1024, 1366×768 e 2560×1440), sem overflow horizontal; busca/dialog dentro da viewport; Manaus→Curitiba; detalhe horário e Escape; reduced-motion; forecast indisponível com leitura salva identificada; nova cidade Recife sem exibir temperatura anterior. Sem erros JavaScript nesses cenários. APIs foram controladas por fixtures, com fuso do navegador em Asia/Tokyo.
- Safari/iOS: revisão de CSS/viewport/safe areas e testes de contratos existentes; WebKit foi baixado, mas não executou neste ambiente por falhas do carregador de bibliotecas. Não equivale a teste num iPhone real.
- Lint e build: não há linter nem compilação de produção configurados. O deploy publica `dist/` diretamente. Não se atribui sucesso a comandos inexistentes.

Há warning experimental de Node para `stripTypeScriptTypes`, já usado nos testes de funções: ele é da API de teste, não um erro do produto. A checagem TypeScript usa Deno de verdade e passou.

## Riscos restantes e decisões de não alterar

1. **Escala de push:** o worker consulta no máximo 100 locais habilitados sem cursor. Acima disso, outros locais podem ficar sem processamento. Requests por local também repetem dados de cidades comuns e são sequenciais. Resolver exige desenho de lotes/checkpoint e budget de execução, com teste de banco/cron; não aplicar uma paginação ilimitada num worker de produção.
2. **Destinos Web Push (resolvido na evolução seguinte):** allowlist compartilhada valida cadastro e envio de inscrições antigas. Consultar `docs/PRODUCT-EVOLUTION.md`; outros provedores precisam validação explícita antes de inclusão.
3. **Campos do detector de push:** ainda existem coerções e defaults numéricos no detector meteorológico e no resumo diário. A próxima etapa deve adotar um contrato de entrada estrito para esses candidatos, preservando ausência, sem confundir dados incompletos com zero. As correções desta entrega protegem validade/área oficial, calendário e intervalo de chuva.
4. **Sincronização de conta:** favoritos/nomes salvos em user_metadata usam merge e tombstones, mas read/merge/write pode conflitar entre abas/dispositivos. Evoluir com teste concorrente de Auth/storage e estratégia transacional adequada; não migrar dados pessoais sem esse preparo.
5. **SW e integrações externas:** a evolução seguinte adiciona `event.waitUntil` síncrono com regressão que mantém a gravação pendente e verifica seu término. Leaflet continua vindo de CDN e APIs continuam sujeitas à disponibilidade/cobertura do provedor. Fixtures não confirmam operação real de produção.
6. **Front ainda parcialmente bruto:** normalização não foi aplicada de uma vez a todos os renderizadores; CSS legado e dois módulos de ícones convivem por compatibilidade. Remover em etapas com evidência de consumidores/seletores, sem exclusão ampla que possa quebrar identidade visual.
7. **Astronomia e expansão geográfica:** o arco solar mantém projeção artística e crepúsculo de janela fixa; não é um planetário nem modela altitude solar completa. A Lua usa posição real na projeção preservada e fica restrita ao céu noturno por decisão visual existente. Horas repetidas de DST sem offset continuam ambíguas; Brasil atual não exige inferir duas ocorrências distintas. Regiões polares e novas geografias exigiriam contratos específicos.
8. **Validação em hardware/serviços:** teclado e barras móveis do Safari, PWA instalado, entrega Web Push, login/sincronização reais e performance em aparelhos fracos não foram exercitados em hardware ou contas de produção. Nenhuma publicação ou envio de notificações foi realizado.

## Próximos passos recomendados

Antes de publicar, revisar o diff e coordenar as funções `smart-summary`/`push-process` e `_shared/http.ts` com o frontend. Depois validar Safari/iPhone real, teclado, orientação e PWA instalado. Em seguida, priorizar escalabilidade/segurança do worker push e contrato estrito dos dados meteorológicos de notificações; testar concorrência de sincronização de conta; medir performance em aparelho intermediário e migrar gradualmente consumidores para snapshots normalizados.

Atualização da etapa seguinte: WebKit foi executado após corrigir o carregador de bibliotecas de teste do ambiente, e passou nos mesmos sete viewports e nos recursos novos. O resultado anterior acima descreve apenas esta rodada histórica. Publicação e validação da evolução são registradas em `PRODUCT-EVOLUTION.md`.

## Fontes fora do ar (outubro/2026)

- Antes: se o Open-Meteo falhasse duas vezes, a Home caía em “Tempo indisponível” ou nos dados salvos, mesmo com o MET Norway respondendo; o MET só complementava campos.
- Agora: até três tentativas com espera crescente; depois, previsão reduzida só com o MET Norway (sem sensação, chance de chuva, UV e visibilidade, que o MET não fornece; esses campos aparecem como indisponíveis). Dados salvos de até 3h continuam preferidos por serem completos. Uma mensagem por sequência de falhas, distinguindo sem internet, fonte fora do ar e previsão reduzida, e nova tentativa automática em 1 minuto (além do intervalo de 5 minutos e do evento `online`).
- Limites: o MET cobre cerca de 60 horas em passos horários, então os 7 dias ficam com 1 a 3 dias; o nascer/pôr é calculado por coordenadas. Se o proxy `met-forecast` (Supabase) também cair, restam os dados salvos. `verify-resilience.py` cobre os três cenários com fixtures; não comprova disponibilidade real dos provedores.
