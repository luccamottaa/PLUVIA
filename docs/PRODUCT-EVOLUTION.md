# Evolução do PLUVIA — 01/10/2026

## Inventário antes das alterações

A análise parte do commit `7b1713e` (auditoria anterior, PR #99 ainda não publicado), dos scripts e consumidores de `dist/`, testes, migrations e funções Supabase. A stack é estática, sem bundler. Fonte normalizada: `weather-data-layer`; estado/refresh: `app.js` + extensões `p0.js`; tempo municipal: `city-time`; astronomia: `sky-atmosphere` + SunCalc. O backend publicado foi consultado separadamente: seis funções usadas pelo repositório estão ativas; há ainda `xweather-map-probe` fora do fluxo do produto.

| Pedido | Estado encontrado | Decisão desta etapa |
|---|---|---|
| 1. Nowcast | Parcial: janela **horária** modelada e radar observado, sem ETA confiável | Não inventar minutos; manter janelas horárias. Nowcast exige produto com resolução temporal, cobertura brasileira, incerteza, licença e quota confirmadas. Interpolar dados horários não cria essa capacidade. |
| 2. Timeline | Existe: 24h, toque, detalhe, chuva e vento | Acrescentar sensação, UV/pressão/direção no detalhe e eventos solares derivados do ciclo compartilhado. |
| 3. Gráficos | Existem temperatura/chuva/vento | Evolução UV compacta; evitar sete painéis novos e duplicação. |
| 4. Interpretação | Existe resumo determinístico, fatores e IA opcional | Corrigir regras que descrevem diferenças térmicas incorretamente; preservar uma leitura principal. |
| 5. Sensação de calor | Existe sensação/umidade | Corrigir sensação menor sem vento e não atribuir causas desconhecidas. |
| 6. UV | Parcial: atual, escala, pico do restante do dia | Preservar classificação atual e mostrar evolução/pico do dia, marcando pico já passado e dados parciais. |
| 7. Vento | Existe bússola meteorológica, rajadas, gráfico | Acrescentar direção no detalhe; origem do vento explícita. |
| 8. Chuva | Existe probabilidade, volume, faixa e intensidade horária | Preservar distinção de unidades/intervalos; não tratar faixa horária como duração contínua de chuva. |
| 9. Alertas | Existe INMET, severidade, área/validade, fonte, dedup push | Manter critérios conservadores; outras fontes oficiais precisam contrato validado. |
| 10. Mapa | Existe radar RainViewer; código satélite/raios sob demanda | Não expor camadas sem validar disponibilidade/licença/custo. |
| 11. Radar animado | Existe play/pause, horário, slider e até sete frames | Preservar; cache de tiles depende do navegador, sem prefetch de todas as cidades. |
| 12. Qualidade do ar | Parcial: US AQI visível; cinco poluentes consultados/normalizados | Expor detalhes sob expansão, unidades/fonte/idade próprias; não misturar AQI europeu. |
| 13. Visibilidade | Existe valor e destaque quando reduzida | Preservar leitura modelada, sem inferir fumaça. |
| 14. Pressão | Existe valor/tendência 3h | Exigir intervalo real de três horas e distinguir previsão modelada de histórico observado. |
| 15. Sol | Existe duração/progresso, arco e horários compartilhados | Reutilizar `sky.dayAt` na timeline, sem outra implementação astronômica. |
| 16. Lua | Parcial: fase, iluminação interna, posição real no fundo | Mostrar iluminação no card usando a mesma leitura; nascer/pôr lunar adiado para contrato de dia municipal/DST. |
| 17. Fundo | Existe ciclo solar/lunar e condição meteorológica | Preservar identidade e movimento; intensidade contínua exige avaliar cascata CSS e transições. |
| 18. Raios | Estética por thunderstorm; backend Xweather separado | Não confundir efeito com detecção; ativação pública depende da conta/quota/atribuição. |
| 19. Favoritos | Existem leituras, cache 20min/36h, lazy load e concorrência 2 | Acrescentar sensação, mínima/máxima e horário municipal, sem consultas de alertas para cada favorito. |
| 20. Comparação | Parcial: cards lado a lado | Enriquecer os próprios cards; não criar tela duplicada. |
| 21. Pesquisa | Existe debounce, catálogo local, chunks, estados, homônimos, controle de respostas | Preservar; não adicionar API geocoding redundante. |
| 22. Offline | Existe última previsão, idade, timeout/retry/reconexão | Garantir persistência de gravações do SW durante seu ciclo de vida. |
| 23. PWA | Existe manifest/ícones/standalone/SW/update/safe areas | Evoluir cache sem armazenar APIs/Auth; instalação real iOS precisa hardware. |
| 24. Compartilhar | Ausente | Web Share com texto leve, clipboard e seleção manual como fallback; fonte/idade sem localização precisa. |
| 25. Localização | Existe timeout, negada/erro, fallback, seleção manual invalida GPS | Preservar; regressões já cobertas. |
| 26. Atualização | Existe refresh central, dedup, background/online | Reutilizar; nenhum timer/fetch por novo card. |
| 27. Loading | Existe primeira previsão progressiva e refresh sem apagar dados | Preservar e testar os novos detalhes em cache/troca de cidade. |
| 28. Erros | Existe classificação HTTP e estados parciais | Corrigir status de leitura anterior em compartilhamento; não expor detalhes de transporte. |
| 29. Movimento | Existe reduced-motion/pausa offscreen/background | Novos gráficos estáticos e detalhes sem animação. |
| 30. Velocidade percebida | Existe shell/municípios/mapa lazy e previsão progressiva | Usar dados existentes e expansão opcional, sem dependências novas. |
| 31. Flags | Não há plataforma de flags | Não introduzir plataforma nem flags sem experimento concreto. |
| 32. Observabilidade | Parcial: códigos HTTP e fontes, analytics, logs backend | Documentar diagnóstico sem coordenadas/segredos; não adicionar coleta pessoal. |
| 33. Segurança | Chave publishable pública correta; credenciais providers no servidor | Corrigir destinos arbitrários de Web Push com validação compartilhada antes de cadastro/envio. |
| 34. Design system | Existe documentação/ícones/componentes CSS | Reutilizar superfícies e controles atuais. |
| 35. Transparência | Existe CSS final sem blur pesado, contraste/fallback | Preservar, não redesenhar. |
| 36. Testes visuais | Parcial: contratos e cenários browser com fixtures | Ampliar verificação browser para novos recursos; não declarar screenshots como baseline automático de CI. |
| 37. Easter eggs | Lua/raios decorativos já existem | Não priorizar efeitos sobre informações úteis. |
| 38. Descobertas | Campos disponíveis não expostos e regras enganosas | Normalizar direção horária; impedir ausência de dados virar leitura térmica/UV/chuva confiável. |

## Ordem e dependências

1. Regras puras UV/sensação/pressão e direção no contrato normalizado; testes de ausências e calendários.
2. UI existente: timeline/detalhe, gráfico UV estático e poluentes em expansão; nenhuma API nova.
3. Favoritos comparáveis com request breve ampliado, mesmo limite de concorrência/cache; horário local não depende do dispositivo.
4. Compartilhamento da mesma fonte normalizada, invalidado imediatamente ao mudar cidade.
5. SW com `waitUntil` desde o evento; validação de destinos Web Push no cadastro e envio (inclusive legados).
6. Validação local/CI/browser, atualização de referências e publicação coordenada frontend/Supabase.

## Limites técnicos e riscos a acompanhar

Open-Meteo/MET/CAMS são modelos, não medições na rua; radar observado não é previsão. UV horário permite pico aproximado, não um minuto exato. Pressão das últimas 3h é retrospectiva do modelo, não uma estação. Favoritos não terão “alerta ativo” até haver uma estratégia compartilhada INMET com abrangência confirmada; buscar alertas por card desperdiçaria consultas e criaria falsa segurança. Cache meteorológico tem idade própria, inclusive AQI.

Nascer/pôr lunar, crepúsculo civil e azimute solar fiel precisam evolução da fonte astronômica comum com limites/testes geográficos. O worker push ainda limita 100 locais; escalar exige paginação/checkpoint e dedup de consultas municipais. Sincronização de metadata entre dispositivos merece testes de concorrência. Segurança de headers/CSP depende do host estático; não prometer headers inexistentes. Medições reais de Web Vitals, Auth/push de produção, instalação e teclado Safari/iOS precisam QA próprio.

## Validação e publicação

Implementados: evolução da timeline/detalhes horários, UV diário estático com classificação atual/pico aproximado e dados parciais; regras de sensação/pressão corrigidas; poluentes CAMS em expansão com idade/fonte próprias; favoritos comparáveis com a consulta breve existente; iluminação lunar da mesma efeméride; compartilhamento por texto; persistência SW e allowlist de Web Push. Nenhuma biblioteca frontend, API meteorológica, timer por card ou camada de mapa foi adicionada.

Regressões: UV após o pico, meia-noite, dados ausentes, sensação menor sem causa conhecida, intervalo de pressão, direção normalizada, validade/idade do texto compartilhado, share cancelado, conclusão atrasada após troca de cidade, extremos diários dos favoritos, lacunas de chuva, intervalo dos eventos solares, persistência de gravação do SW, shell offline, HTTP inválido e destinos SSRF. Os testes carregam dependências reais em vez de simular regras com regex.

Validação local: `node --test tests/*.test.cjs` passou em 61 arquivos; `node --test --test-isolation=none tests/*.test.cjs` passou em 212 entradas, sem falhas/skips. Sintaxe de 35 JS/CJS, checagem Deno das seis funções e `git diff --check` passaram. Não há lint nem compilação frontend configurados: produção publica `dist/` diretamente.

`scripts/verify-browser.py` torna o QA reproduzível com Python Playwright opcional, sem dependência no app. Chromium e WebKit passaram em 320×568, 390×844, 430×932, 844×390, 768×1024, 1366×768 e 2560×1440, sem overflow ou erros JavaScript nos cenários. Foram verificados busca, troca Manaus→Curitiba→Recife, favoritos com sensação/extremos/horário, detalhes de UV/pressão/vento, poluentes, gráfico UV, reduced-motion, compartilhar com fallback manual, compartilhamento de leitura salva e limpeza após mudar cidade offline. Clima foi controlado por fixtures; fuso do navegador Asia/Tokyo. O teste rápido `agent-browser` também confirmou shell, conteúdo e controles sem erros. WebKit Linux não é um iPhone físico.

Consultas reais Open-Meteo Forecast e Air Quality retornaram HTTP 200 para Manaus. A validação das unidades e dos contratos reais é separada dos testes de UI; esse resultado pontual não é garantia de uptime. MET/INMET/radar continuam sujeitos aos contratos já documentados.

O QA browser também captura, com relógio/dados controlados, dia limpo, noite limpa, chuva, tempestade, nublado, nascer e pôr do sol. Esses sete cenários passaram em Chromium/WebKit sem erros ou overflow. As capturas são artefatos de revisão, não comparação automática de pixels nem garantia de contraste em todas as situações.

Advisors Supabase: proteção contra senhas vazadas desativada, pendência de configuração Auth ([orientação](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). Dois avisos informativos de RLS sem políticas em `lightning_cache`/`lightning_budget` são esperados em tabelas internas acessadas somente pelo servidor; não abrir políticas para silenciar esse aviso ([referência](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). Cadastro/envio push agora bloqueiam hosts arbitrários, IPs locais, credenciais em URL e domínios que imitam o provedor. Entrega real nos serviços permitidos ainda exige teste com um dispositivo do usuário; nenhuma notificação de teste foi enviada a contas reais.

Publicação: verificar CI antes de integrar o PR #99; publicar `smart-summary`, `push-subscriptions`, `push-send` e `push-process`, preservando a configuração JWT, para acompanhar as dependências compartilhadas e o hash v2 da auditoria anterior. Fontes remotas dessas funções foram comparadas com `main` e coincidiram; `met-forecast`/`lightning` não precisam republicação, pois não mudaram. Backend/frontend com hashes temporariamente diferentes mantêm resumo determinístico; a IA fica pendente até ambos usarem v2. Resultado da publicação será conferido no Pages e nos endpoints, sem invocar o cron push com usuários reais.

## Etapa de conta, avisos e operação — 01/10/2026

Recuperação e exclusão foram implementadas usando Auth existente. Templates personalizados preparados, aplicação hospedada depende de configuração Auth. Favoritos agora reaproveitam avisos municipais vigentes do INMET, sem requests por card. Animação de todos os diálogos e detalhes usa opacity/transform com reduced motion. CI visual Chromium/WebKit, monitor público agendado e relatório SQL agregado foram adicionados. Consulte ACCOUNT-EMAILS.md, OPERATIONS-AND-QA.md e NOWCAST-EVALUATION.md para resultados, aplicação e limites. Hardware iPhone, pixel baselines e qualidade regional de nowcast continuam pendentes; os inventários anteriores descrevem o estado de suas respectivas etapas.
