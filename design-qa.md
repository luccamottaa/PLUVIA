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

Os 358 testes Node passaram, incluindo os contratos de cache e o orçamento dos assets. O workflow também executa os testes gerais de layout, conta, estados visuais, Nowcast e planejamento, além de sintaxe e tipos das funções.

## Diferenças intencionais e limites

O Pluvia mantém sua identidade, os dados, os cards e a navegação. A iluminação segue o seu relógio municipal existente; as nuvens são uma representação decorativa da condição, não uma leitura espacial da nebulosidade. A referência Apple orienta textura, profundidade e suavidade.

WebKit automatizado não substitui um teste no iPhone físico. FPS, consumo de bateria e contraste numérico não foram medidos. Não há lint ou build frontend configurados; `dist/` contém os arquivos publicados.
