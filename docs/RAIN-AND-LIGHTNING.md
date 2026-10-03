# Chuva e raios no fundo do Pluvia

Evolução visual das duas camadas de chuva e do elemento de relâmpago já presentes na intro e na home. O céu, a astronomia, o mapa e as APIs continuam na arquitetura existente. Não há novo elemento no DOM, renderer, biblioteca, listener ou timer.

## Chuva

`rain-far.svg` contém gotas finas, menores e com transparências variadas; `rain-near.svg` contém rastros maiores, com cauda transparente e brilho concentrado perto da ponta. As camadas têm velocidades e posições diferentes para criar profundidade. O SVG é uma textura estática; apenas a superfície se desloca com `transform`.

A altura de repetição é sempre 480px e a animação percorre exatamente 480px. Isso conserva o encaixe no reinício do loop. Alterar densidade modifica somente a largura da repetição, sem criar um loop por gota. Opacidade muda suavemente em dois segundos; ausência de chuva pausa imediatamente o deslocamento e deixa a camada desaparecer.

`sky-atmosphere.js` escreve o mesmo perfil na raiz e no body, junto do estado atmosférico existente. A classificação é uma escolha visual a partir dos códigos WMO já fornecidos pela previsão:

| Representação | Códigos |
| --- | --- |
| Garoa | 51, 53, 55, 56, 57 |
| Chuva leve | 61, 66, 80 |
| Chuva moderada | 63, 81 |
| Chuva forte | 65, 67, 82 |
| Trovoada | 95, 96, 99: perfil visual moderado, sem presumir volume elevado |
| Sem gotas | Outros códigos, neve, neblina e dados ausentes/inválidos |

Os perfis controlam somente a decoração. Probabilidade de precipitação nunca controla o volume visual, e o movimento não representa velocidade ou direção observada do vento. Nenhum número meteorológico é alterado. Códigos de chuva congelante conservam a representação de chuva; não se simula uma medição de gelo.

## Raios e iluminação

`lightning-near.svg` e `lightning-far.svg` desenham canais finos, ramificações assimétricas e um halo por sobreposição de traços estáticos. Substituem o polígono espesso em formato de ícone. Não usam filtro SVG, turbulence, blur animado, canvas ou captura de tela.

Os pseudo-elementos `::before` e `::after` do único `.sky-lightning` combinam um canal e um gradiente de iluminação localizado nas nuvens. Só aparecem com `data-weather="storm"`. Os ciclos diferentes de 23 e 37 segundos têm um único pulso cada, com subida e dissipação, permanecendo transparentes na maior parte do tempo; não há sequência rápida de flashes brancos de tela inteira. O pico do efeito próximo é limitado a .38 de dia e .52 à noite; o distante é mais fraco.

São animações decorativas, determinadas pela condição de trovoada da previsão. Não representam raios detectados, posição de queda, frequência elétrica observada ou uma trajetória. Eventos reais continuam na camada de raios do mapa com sua fonte, horário e orçamento existentes; essa evolução não consulta Xweather nem outro provedor.

## Movimento, cache e limites

O controlador `observeMotion` existente coordena intro/home, viewport e página oculta. A regra de pausa agora cobre elementos e ambos os pseudo-elementos. `prefers-reduced-motion` remove movimento/transições e esconde os relâmpagos, conservando chuva estática e todas as informações meteorológicas.

Os quatro SVGs somam 4.943 bytes. Entram no precache `pluvia-panel-61`, com `sky.css?v=sky-9` e `sky-atmosphere.js?v=sky-8`. `rain-drops.svg` continua servido para shells antigos, mas deixa o precache atual. Não apagar imediatamente os assets legados.

## Verificação

- Testes Node: categorias WMO em ambas as cenas, aumento visual entre perfis, velocidades diferentes, trovoada sem volume inventado e remoção da chuva após condição seca/neve/neblina/dado inválido. Contratos de cache limitam os quatro SVGs a 15KB.
- `python scripts/verify-clouds.py` e variante `PLUVIA_BROWSER=webkit`: onze estados em cinco viewports, decode dos assets, geometria, chuva estática, raios ausentes com reduced-motion, amostragem das animações nativas, camada próxima/distante, pausa de ambos os pseudo-elementos em background/offscreen, preservação das animações da chuva e saída da tempestade.
- `python scripts/verify-visual.py`: leituras, alertas, diálogos, loading e erro continuam no QA geral; o workflow também verifica os demais fluxos existentes.

O QA usa fixtures, inclusive nas capturas dos clarões; amostra quadros estáticos, sem gerar vídeo acelerado de flashes. Não comprova chuva real, detecção de raios, hardware iPhone, FPS, consumo de bateria ou contraste numérico.
