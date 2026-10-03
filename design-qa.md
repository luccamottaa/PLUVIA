# Design QA — nuvens do Pluvia

Result: **passed**

Escopo: trocar a aparência das nuvens existentes, seguindo a direção visual do céu da referência Apple Weather enviada pelo usuário. A referência não solicita copiar os cards, a tipografia ou a navegação da Apple. Não há mudança de arquitetura meteorológica.

## Referências e evidência

- Referência do usuário: screenshot Apple Weather/Manaus, 590 × 1280, disponível na conversa; céu azul acinzentado, nuvens suaves com textura e profundidade.
- Fontes visuais desta implementação: texturas originais geradas, `dist/assets/sky-cloud-veil.webp` e `dist/assets/sky-cloud-volume.webp`, 1120 × 560, com alpha. Não são assets da Apple nem observações do céu de Manaus.
- Capturas do aplicativo real: preview estático do repositório, Chromium e WebKit, escala CSS 1, com fixtures e relógio municipal fixo. Fontes externas são bloqueadas pelo QA; os fallbacks declarados continuam disponíveis.
- Comparação conjunta inspecionada: `/tmp/pluvia-clouds-source-final.png`, com as duas texturas compostas sobre a cor do céu à esquerda e o aplicativo a 390 × 844 à direita. A composição das referências serve apenas à revisão, não é um asset publicado.
- Capturas finais: `/tmp/pluvia-clouds-final-chromium/clouds/` e `/tmp/pluvia-clouds-final-webkit/clouds/`. O workflow de interface conserva suas próprias capturas como artifacts por sete dias.

As capturas mostram dados meteorológicos fictícios para verificação visual. Não representam condições atuais ou detecções observacionais.

## Revisão

| Área | Resultado |
| --- | --- |
| Nuvens | Duas texturas diferentes, detalhe fotográfico, volume suave e bordas transparentes. Sem a repetição do recorte antigo. |
| Movimento | Transformações pequenas, velocidades diferentes e reversão suave. Atualizar a condição preserva os objetos de animação existentes. |
| Cores e leitura | Céu nublado azul acinzentado, nuvens escuras à noite, efeitos próprios de chuva e tempestade preservados. Atenuação do crepúsculo noturno evita trechos excessivamente claros atrás da leitura branca. Revisão visual, sem alegação de contraste numérico medido. |
| Tipografia, layout e copy | Declarações e estrutura existentes preservadas. Cidade, temperatura, condição, conta, pesquisa e compartilhamento continuam legíveis e visíveis. |
| Assets e limites | WebP com alpha, 121.206 bytes no total; superfícies limitadas à largura da viewport mais 128px e altura até 640px. Sem tile, canvas ou blur animado. |
| Responsividade | Sem overflow horizontal nos cinco tamanhos verificados, incluindo celular pequeno, paisagem e desktop largo. |
| Acessibilidade | Reduced-motion mantém nuvens estáticas e remove transições; informações meteorológicas permanecem disponíveis. |

## Iterações corrigidas

1. **P1 — emenda de repetição:** a primeira integração das novas texturas com `repeat-x` produzia uma borda vertical perceptível no celular. A versão final usa `no-repeat`, `cover` e movimento limitado dentro da margem lateral.
2. **P2 — leitura no pôr do sol:** a luz clara do crepúsculo atrás do texto branco reduzia a legibilidade. A camada existente recebe atenuação estática somente no período noturno da home, mantendo os horários e o cálculo astronômico compartilhado.
3. **Sincronização do QA:** esperar a temperatura receber um valor não garantia que seu contêiner já estivesse visível. O teste agora aguarda a visibilidade da leitura, como o QA geral existente, antes de verificar e capturar a tela.

Após essas correções, nenhuma pendência visual P0, P1 ou P2 foi identificada nas capturas revisadas.

## Verificação automatizada

`scripts/verify-clouds.py` passou em Chromium e WebKit:

- Oito estados: céu limpo, parcialmente nublado, nublado, chuva, tempestade, nublado à noite, nascer do sol e pôr do sol.
- Cinco viewports: 320 × 740, 390 × 844, 844 × 390, 1366 × 768 e 2560 × 1080; 40 capturas por navegador.
- Decode dos dois assets, duas camadas limitadas, ausência de overflow, visibilidade dos controles principais e reduced-motion.
- Objetos de animação preservados ao mudar a condição; pausa fora da tela e no céu limpo; sem erros JavaScript capturados.

Na etapa de nuvens, os 358 testes Node passaram, incluindo os contratos de cache e o orçamento dos assets. O workflow também executa os testes gerais de layout, conta, estados visuais, Nowcast e planejamento, além de sintaxe e tipos das funções.

## Diferenças intencionais e limites

O Pluvia mantém sua identidade, os dados, os cards e a navegação. A iluminação segue o seu relógio municipal existente; as nuvens são uma representação decorativa da condição, não uma leitura espacial da nebulosidade. A referência Apple orienta textura, profundidade e suavidade.

WebKit automatizado não substitui um teste no iPhone físico. FPS, consumo de bateria e contraste numérico não foram medidos. Não há lint ou build frontend configurados; `dist/` contém os arquivos publicados.

## Evolução posterior — chuva e raios

Result: **passed** para a revisão visual e os contratos atmosféricos em Chromium e WebKit.

Reutiliza as duas camadas de chuva e o único elemento de relâmpago, sem alterar layout, copy ou dados meteorológicos. Os SVGs `rain-far` e `rain-near` têm rastros com tamanhos/transparências diferentes. `lightning-near` e `lightning-far` têm canais finos com ramificações e halo estático; os pseudo-elementos combinam esses canais com iluminação localizada nas nuvens.

Evidência final: `/tmp/pluvia-rain-final-chromium/clouds/` e `/tmp/pluvia-rain-final-webkit/clouds/`. Inspecionadas capturas de chuva forte, tempestade noturna e clarões próximos/distantes de dia e à noite, em celular e desktop. Quadros de clarão são amostrados e pausados no pico; não há vídeo acelerado ou nova sequência de flashes no relatório.

- Onze estados atmosféricos em cinco viewports: 55 capturas por navegador, acrescidas de 12 quadros de clarão em 320, 390 e 1366px, para 67 capturas atmosféricas por navegador.
- Raios com brilho local e ramificações mais naturais, sem o ícone antigo ou flashes brancos de tela inteira; controles e leitura principal continuam visíveis.
- Movimento da chuva amostrado no mesmo ponto do tile de 480px; profundidade, velocidades diferentes e continuidade do loop preservadas.
- Pausa em background/offscreen inclui `::before` e `::after`; reduced-motion conserva gotas estáticas e remove raios. Mudanças de chuva preservam suas animações, e sair de tempestade remove os relâmpagos.
- 362 testes Node aprovados, incluindo categorias WMO, ausência de volume inventado em trovoadas, remoção de gotas com dados inválidos/condição seca e contratos de cache. Os quatro SVGs somam 4.943 bytes.

A amostragem evita tempos negativos nas animações com delay e aguarda a animação existente de entrada do conteúdo terminar. A verificação de pausa usa animações novas, sem os overrides de play-state usados apenas para congelar os quadros de revisão.

Nenhuma pendência visual P0/P1/P2 identificada nas capturas finais revisadas. Os efeitos são decorativos, separados das detecções reais de raios do mapa. Os limites de hardware e medição descritos acima permanecem. Funcionamento e códigos estão em `docs/RAIN-AND-LIGHTNING.md`.

## Evolução posterior — estrelas noturnas

Result: **passed** para revisão visual e contratos de brilho/movimento em Chromium e WebKit.

Campo irregular de pontos pequenos, com brilho, tamanho e tonalidade variados. Só oito pontos destacados cintilam; os demais ficam estáticos. Nuvens e Lua permanecem à frente. Uma máscara estática dissipa as estrelas na parte inferior sem interferir no layout ou na leitura.

Evidência: `/tmp/pluvia-stars-chromium/clouds/` e `/tmp/pluvia-stars-webkit/clouds/` para treze estados em cinco viewports (65 capturas), além dos 12 quadros de relâmpago preservados. A revisão final de cintilação, máscara e movimento está em `/tmp/pluvia-stars-final-chromium/clouds/` e `/tmp/pluvia-stars-final-webkit/clouds/`, incluindo capturas normais em 390 e 1366px. Inspecionados céu limpo/parcial à noite, desktop, celular e paisagem.

- Brilho segue o horário municipal e o crepúsculo náutico da fonte solar compartilhada; desaparece de dia e com tempo fechado. O teste da borda do pôr do sol foi ajustado para esperar brilho zero no instante exato, conforme o motor.
- Sem drift, repetição de textura, canvas, filtro ou loop por ponto. Pausa em background/offscreen, animação preservada em atualizações e reduced-motion estático foram verificados nos dois navegadores. Não foram capturados erros JavaScript.
- Suite Node: 356 casos `node:test` e 13 arquivos de assertions diretas aprovados. Sete casos novos verificam horário, crepúsculo, clima, meia-noite, troca de cidade, fallback e cache solar.
- Sintaxe JavaScript e `deno check` passaram; QA visual geral em Chromium/WebKit passou. Não há lint ou build frontend configurado.
- Assets originais totalizam 12.983 bytes, limitados a 16KB pelo contrato de cache e disponíveis offline.

Nenhuma pendência visual P0/P1/P2 identificada nas capturas revisadas. O campo é decorativo, sem promessa de constelações/posições observadas. Os limites de hardware iPhone, FPS, bateria e contraste numérico continuam os mesmos.

## Correção posterior — astros atrás das nuvens e toque duplo

Result: **passed** para cobertura dos astros e política de toque em Chromium e WebKit.

O empilhamento já estava correto; a opacidade global baixa das nuvens parcialmente nubladas fazia os discos atravessarem seus corpos densos. Ambas as camadas agora conservam o alpha da textura com opacidade global 1. Espaços transparentes e bordas continuam suaves; o filtro noturno parcial estático usa brightness .34. Posição, horário, fase lunar, animações e assets existentes foram preservados.

Evidência: `/tmp/pluvia-occlusion-final-chromium/clouds/` e `/tmp/pluvia-occlusion-final-webkit/clouds/`. Quatorze estados em cinco viewports geraram 70 capturas estáticas por navegador; somam-se duas capturas de estrelas em movimento normal e 12 quadros de clarão, totalizando 84 por navegador. Foram inspecionados céu parcial diurno/noturno e Lua acima do horizonte, em celular e desktop.

- Regressão de pixels para Sol e Lua, separadamente atrás de cada camada. Uma textura controlada existe somente no teste; o deslocamento usa os keyframes de produção. Nos quatro casos por navegador, a diferença normalizada foi 0 na faixa opaca e 1 no espaço transparente. Isso verifica composição visual, não observações meteorológicas.
- Movimento existente preservado em atualizações, pausa fora da tela/background, reduced-motion e gates de chuva/estrelas passaram; nenhum erro JavaScript capturado.
- `touch-action: manipulation` no body remove o zoom de página por toque duplo e permite pan/pinch. A meta viewport continua sem bloqueio de escala; não há interceptação global de eventos ou alteração dos handlers Leaflet. O QA geral passou nos dois navegadores, com dois toques simulados sem mudança de `visualViewport.scale`, sete viewports, diálogos, cidades e fallback offline.
- Sintaxe JavaScript, 356 casos `node:test` e 13 arquivos de assertions diretas passaram. Contratos de cache acompanham `pluvia-panel-63`, `sky.css?v=sky-11` e `continuous.css?v=layout-24`. Nenhuma dependência ou asset novo foi adicionado.

Nenhuma pendência visual P0/P1/P2 identificada nas capturas revisadas. O gesto nativo em PWA instalado e o zoom por pinça ainda precisam de confirmação em iPhone físico; a automação verifica a política CSS e toques simulados. Os demais limites de medição descritos acima permanecem.

## Ajuste solicitado — bloquear também pinça no PWA

O usuário pediu remover todo zoom da página no app instalado. `modules/pwa-gestures.js` detecta o modo standalone padrão e o sinal Apple, aplica pan-x pan-y no html/body e cancela gesturestart/change do Safari fora do mapa. A aba do browser mantém pinch; os handlers Leaflet continuam disponíveis. Não há interceptação de touchstart/move/end, alteração da meta viewport ou novo timer. O módulo tem 1.122 bytes, carrega com defer e entra no precache `pluvia-panel-64`, junto de `continuous.css?v=layout-25`.

Sintaxe JavaScript e suíte Node passaram: 361 casos node:test e 13 arquivos de assertions diretas, incluindo cinco casos novos para browser, standalone, sinal Apple, mapa e saída/retorno do modo instalado. QA geral passou em Chromium/WebKit, incluindo os sete viewports existentes e duas sessões adicionais por navegador que emulam os sinais de instalação. Foram verificadas a política CSS, a prevenção de gestos sintéticos na página, a exceção do mapa, a busca utilizável, inputs com pelo menos 16px, escala 1 e ausência de overflow/erros JavaScript.

Não foi testado um PWA físico: os sinais de instalação e eventos de gesto são emulados. O teste nativo em iPhone continua pendente. Layout e efeitos meteorológicos não foram alterados.
