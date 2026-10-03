# Estrelas no céu noturno

O campo estelar é uma representação decorativa: pontos pequenos, distribuição irregular, brilho/tamanho variado e algumas tonalidades suaves. Não representa um catálogo, constelações ou posições astronômicas observadas. Não há linhas, estrelas em formato de ícone ou deslocamento do campo.

## Integração e horário

Uma única `.sky-stars` pertence a cada cena existente, intro e home. Fica atrás da Lua e das nuvens, sem interatividade ou conteúdo acessível próprio; as cenas já são `aria-hidden`. O fundo estático usa `sky-stars.svg`; oito pontos separados usam `sky-stars-shimmer.svg` no pseudo-elemento `::after`, com uma cintilação suave de nove segundos. Os pontos dos dois assets não se sobrepõem.

`sky-atmosphere.js` controla `--stars-visibility` junto dos astros existentes. Usa o calendário municipal, os limites nascer/pôr do sol de `dayAt` e o crepúsculo náutico do mesmo cache SunCalc. A entrada gradual vai do pôr do sol ao fim do crepúsculo náutico; a saída vai do início desse crepúsculo ao nascer do sol. Uma curva suave liga os extremos, atualizada pelo relógio central existente, sem timer adicional.

Quando há previsão, seus limites solares continuam determinando dia/noite. Se o crepúsculo calculado não estiver disponível ou formar uma janela incompatível (menos de 15 minutos ou mais de três horas), o fade usa uma janela visual de 45 minutos. Sem horários solares, respeita a fase disponível do provedor. Relógio inválido e fase desconhecida não exibem estrelas. O fade é uma escolha visual, não uma previsão da visibilidade de estrelas ou uma medição de poluição luminosa.

Céu limpo tem visibilidade integral; parcialmente nublado, 48%, com as nuvens por cima. Tempo fechado, chuva, trovoada, neve, neblina e condição ausente ocultam o campo. O CSS também exige fase noturna e condição limpa/parcial, mesmo se um shell legado conservar a variável de brilho. A atualização de cidade/dia não recria o campo ou sua animação.

## Movimento e custo

Somente a opacidade dos poucos pontos destacados cintila; o restante fica estático. Não há loop por estrela, canvas, WebGL, blur/filtro, biblioteca, request meteorológico ou listener novo. O controlador de movimento existente pausa cenas fora da tela, abertura oculta e documento em background. Dia/tempo fechado pausam a cintilação. Reduced-motion mantém o campo estático e remove transições/cintilação.

Os dois SVGs somam 12.983 bytes e têm orçamento de 16KB nos contratos. Entram no precache `pluvia-panel-62`; referências compartilhadas são `sky.css?v=sky-10` e `sky-atmosphere.js?v=sky-9`. As superfícies não repetem a textura e têm altura limitada a 760px. Uma máscara estática atenua o campo na parte inferior, evitando uma borda abrupta atrás dos cards.

## Verificação

- `tests/sky-stars.test.cjs`: noite municipal, is_day antigo, entrada/saída no crepúsculo, reabertura sem reinício, condições meteorológicas, troca rápida entre fusos, meia-noite, limites da previsão, fallback e reaproveitamento do cache solar.
- `scripts/verify-clouds.py`: treze estados atmosféricos em cinco viewports, incluindo céu limpo/parcial à noite, assets decodificados e campo único por cena. Verifica ausência de drift, preservação da animação, pausa em background/offscreen, reduced-motion e bloqueio diurno/tempo fechado com brilho legado. Mantém os testes de nuvens, chuva e raios anteriores.
- `scripts/verify-visual.py`: QA geral de estados, layout, leituras e diálogos em Chromium/WebKit; os workflows também executam os demais fluxos existentes.

As capturas usam fixtures e horário do dispositivo em Asia/Tokyo. WebKit automatizado não comprova hardware iPhone, FPS, bateria ou céu real visto daquela cidade.
