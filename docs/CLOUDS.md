# Nuvens do Pluvia

Esta evolução usa o céu da referência Apple Weather enviada pelo usuário como direção para nuvens fotográficas, com detalhes suaves e profundidade. Preserva a interface, as cores de leitura e a fonte astronômica existentes; não é uma reprodução da tela da Apple.

## Renderização

`sky.css` reutiliza os dois elementos `.sky-clouds` de cada cena (intro e home). `sky-cloud-veil.webp` forma a camada distante e `sky-cloud-volume.webp` acrescenta volume à frente. São texturas originais geradas, com alpha, comprimidas em WebP de 2100 × 700 (3:1); não são fotografias observacionais de Manaus nem assets extraídos da Apple.

As texturas emendam consigo mesmas na horizontal (geração periódica em x) e se repetem em `repeat-x`. Cada superfície tem altura entre 440px e 640px, tile de três alturas e largura da tela + um tile; o keyframe desliza linearmente exatamente um tile, então a volta do loop cai na mesma imagem, sem salto. O véu completa o tile em 460s e o volume em 300s (paralaxe; no celular, cerca de 3 e 4 px/s). A primeira versão (260s/160s) pareceu rápida demais ao usuário. Não há novo elemento, listener, timer, canvas, shader ou biblioteca.

`data-weather` e `data-phase` continuam sendo determinados por `sky-atmosphere.js`, com a condição da previsão e o relógio astronômico municipal. Opacidade e tonalidade são decorativas: não representam uma medição adicional de nuvens nem uma trajetória meteorológica. Céu limpo/condição desconhecida deixam as camadas transparentes e pausadas. Mudanças de condição suavizam a opacidade por quatro segundos, preservando as animações. Não animar filtros ou máscaras.

O código WMO 1 (predomínio de céu limpo, “céu quase limpo” à noite) recebe `data-clouds="few"` na mesma atualização da condição, tanto na intro quanto na Home. Antes, códigos 1 e 2 compartilhavam também a cobertura densa, contradizendo o texto. O código 1 reutiliza as duas texturas em bancos menores: uma máscara elíptica repetida a cada meio tile revela um banco por vez, centrado numa região densa da textura (39% e 46% do meio tile, 34% da altura); máscara e textura deslizam juntas, então cada banco atravessa o céu sem mudar de forma; o tamanho considera largura e altura estável do viewport para não encher uma tela em orientação horizontal. Código 2 conserva seu perfil parcialmente nublado. A paleta `data-weather="partly"`, o relógio, os astros e os objetos de animação continuam compartilhados. O perfil volta a `standard` em todas as outras condições, inclusive dados inválidos, e é restaurado pela abertura com cache. Não há nova consulta, asset, nó ou timer.

Essa cobertura é uma representação qualitativa do **mesmo código meteorológico que fornece o texto**, não uma porcentagem observada nem uma foto local. Não usar probabilidade de chuva para preencher nuvens. Os interiores dos bancos esparsos também mantêm opacidade global 1; somente suas bordas e espaços ficam transparentes.

Sol e Lua ficam no nível 1; as nuvens, no 2. Em céu parcialmente nublado, ambas as camadas usam opacidade global 1: o alpha das texturas define sozinho os corpos densos, bordas suaves e espaços abertos. Atenuar a camada inteira a 35–40% fazia os discos atravessarem até regiões densas. À noite, também em nublado/chuva/tempestade/neve, ambas as camadas conservam opacidade global 1 e o filtro estático brightness(.33) com leve tom azulado (sepia + hue-rotate) mantém a leitura sobre os corpos opacos. A Lua do fundo ilustra o ciclo noturno municipal; fase e horários reais do card continuam na efeméride compartilhada. Não diminuir novamente a opacidade global para suavizar nuvens sem verificar a cobertura dos astros. O movimento existente desloca a textura e seus recortes juntos; não há segundo astro, máscara animada ou detector por frame.

O controlador `observeMotion` existente pausa cenas fora da área visível e no background. `prefers-reduced-motion` conserva o céu estático e remove transições. O filtro noturno evita deixar nuvens brancas muito iluminadas; chuva e tempestade mantêm os seus próprios efeitos.

Na home, a luz do crepúsculo recebe uma atenuação estática quando o relógio municipal já está no período noturno, para conservar contraste com o texto branco. O horário, o peso da transição e o céu da intro continuam na implementação astronômica existente.

A paleta noturna usa azul profundo com índigo: céu limpo parte de #10142d e se dissolve na base #080f22, com brilho radial discreto. Tempo fechado mantém variações próprias, também escurecidas. O fundo inicial acompanha a base para evitar uma abertura mais clara antes do CSS. As cores diurnas e os gradientes de amanhecer/pôr do sol permanecem os mesmos; a atenuação noturna do crepúsculo usa a nova base, sem mudar o seu peso ou horário. Não há camada escura sobre texto, estrelas ou Lua.

## Tamanho e cache

Medidas dos arquivos desta implementação:

| Asset | Bytes |
| --- | ---: |
| Véu | 45.420 |
| Volume | 75.786 |
| Total novo | 121.206 |
| Imagem antiga | 255.734 |

As novas texturas somam aproximadamente 53% menos bytes que a imagem antiga. Isso descreve os assets, não uma medição de FPS, bateria ou velocidade total do aplicativo. O teste de cache limita a soma a 360KiB (antes 160KiB; ver “Nuvens dinâmicas”).

O SW guarda ambas as texturas e a versão de `sky.css` referenciada pelo HTML. O antigo `sky-cloud-bank.webp` continua servido por compatibilidade com shells antigos, mas sai do precache atual; só deve ser removido numa limpeza que considere instalações legadas. A evolução posterior de chuva e raios está em [RAIN-AND-LIGHTNING.md](RAIN-AND-LIGHTNING.md).

## Verificação

- `node --test --test-isolation=none tests/*.test.cjs`: contratos meteorológicos, astronomia, cache e regressões existentes.
- `python scripts/verify-clouds.py`: dezessete condições em cinco viewports (320 × 740, 390 × 844, 844 × 390, 1366 × 768 e 2560 × 1080), incluindo céu quase limpo de dia/noite e Lua ilustrada em noite parcial/nublada; decode das imagens, duas superfícies limitadas, leitura principal, ausência de overflow, animações preservadas, pausa fora da tela/tempo limpo e reduced-motion. Também amostra chuva, raios e estrelas.
- A regressão de cobertura compara os pixels pintados com/sem nuvens reais, escondendo textos e astros somente no teste. Em vinte combinações de viewport/fase/cena, o perfil esparso deve ocupar menos de 25% da região amostrada e menos da metade do perfil parcial. Esses limites são contratos visuais, não uma medição de nebulosidade meteorológica.
- Regressão de cobertura compara pixels do Sol e da Lua com e sem cada camada, usando somente no teste uma textura opaca com um recorte transparente. Os keyframes reais levam o recorte sobre o disco: a região coberta deve ocultar o astro e a região aberta deve revelá-lo. A textura de teste não é publicada e não é dado meteorológico. Baselines escondem o disco com display:none, porque visibility no pai pode ser sobrescrito pelo SVG lunar compartilhado.
- A composição esparsa passa pela mesma comparação de discos nos interiores opacos de sua máscara e nos espaços livres. Atualizações entre códigos 1, 2 e 3 devem conservar os objetos das animações existentes.
- `PLUVIA_BROWSER=webkit python scripts/verify-clouds.py`: mesma verificação em WebKit instalado.
- `python scripts/verify-visual.py`: estados gerais e diálogos; integra-se ao workflow de interface junto do novo QA.

Os screenshots usam previsões fictícias e horário municipal fixado, com dispositivo em Asia/Tokyo. Não comprovam sensores reais, hardware iPhone, FPS ou consumo energético. Revisão visual documentada em `design-qa.md`.

## Refino das texturas (outubro/2026)

As texturas originais tinham alfa quantizado em 16 níveis e blocos de compressão no degradê. Como a camada é esticada cerca de 2,4× no celular (cover sobre altura fixa), as bordas apareciam em degraus, “pixeladas”. `scripts/refine-cloud-textures.py` reconstrói um alfa contínuo (suavização limitada a meio degrau do original, preservando o desenho), remove os blocos do RGB em cor pré-multiplicada e regrava em 1120 × 560 com alfa de 64 níveis: 53,9KiB + 98,9KiB, dentro do orçamento de 160KiB. As URLs usam `?v=clouds-2` no CSS e no precache. Não reprocessar a saída: a entrada são as texturas originais do histórico. Uma versão 2× foi avaliada e descartada: sem arte de origem maior, não acrescenta detalhe e custaria ~410KiB. Mais nitidez real exige nova arte em resolução maior. `verify-clouds.py` exige ao menos 48 níveis de alfa.

## Nuvens suaves geradas (outubro/2026)

Inspiradas no caráter das nuvens do Apple Weather (véus translúcidos e massas macias de baixa frequência), sem copiar nenhum asset: as duas texturas agora são arte original gerada por `scripts/generate-soft-clouds.py`. O script faz síntese espectral (ruído 1/f^β anisotrópico, periódico nas bordas), distorção de domínio para fiapos, limiar suave com envelope vertical por camada e luz de cima (topo claro, base acinzentada para definição no céu diurno). Calcula em 1600 × 800 e entrega 1120 × 560 com alfa suavizado em 64 níveis: 77,0KiB + 80,2KiB = 157,3KiB, e o script falha se passar de 160KiB. Conteúdo de baixa frequência estica sem parecer pixelado, que era a causa visível das bordas “pranchadas”. No parcial as duas camadas seguem com opacidade 1; o véu cobre a maior parte do quadro para o céu nublado continuar fechado. URLs `?v=clouds-3`. O refino da seção anterior ficou obsoleto e foi removido. Dimensões, alfa e movimento desta seção foram substituídos por “Nuvens dinâmicas”, abaixo. Não há geração em tempo de execução: o app só exibe os arquivos.

## Nuvens dinâmicas (outubro/2026)

O usuário achou a versão anterior estática e embaçada: o movimento era ±32px em mais de cem segundos e o alfa havia sido suavizado demais para caber em 160KiB. Mudanças:

- **Movimento contínuo:** as camadas deixam de oscilar e deslizam para a esquerda sem parar (transform linear de um tile, `repeat-x`), com velocidades diferentes por camada. A pausa fora da tela, em segundo plano e com céu limpo, e o reduced-motion (composição estática deslocada) continuam iguais.
- **Estrutura:** `scripts/generate-soft-clouds.py` agora gera cúmulos com lóbulos (ruído billow), borda definida por limiar estreito, sombra própria (nuvem acima escurece a base) e relevo pela altura contínua. Massas são distribuídas por um filtro passa-alta (`masses`), em vez de um único bloco por quadro.
- **Emenda:** a textura é calculada direto em 2100 × 700, sem redimensionar; desfoques e derivadas são circulares em x (FFT). O QA confere a diferença entre a última e a primeira coluna.
- **Encoberto:** como o véu agora tem vãos definidos, nublado/chuva/tempestade/neve somam uma névoa uniforme atrás da textura do véu (mesma camada e filtro, invisível ao deslizar) e, de dia, o volume sobe para 75% da opacidade da condição.
- **Noite:** o filtro estático ganha leve tom azulado com o mesmo brilho, em vez de cinza neutro.

Custo: 151,4KiB + 191,9KiB = 343,3KiB no precache (orçamento 360KiB, verificado pelo gerador e pelo teste de cache). O alfa continua sem perdas com 64 níveis; alfa com perdas do WebP reduzia para 12–16 níveis e voltaria a desenhar degraus. A camada fica mais larga (tela + um tile); WebKit e Chromium usam camadas em tiles para superfícies grandes, mas isso não é uma medição de memória, FPS ou bateria em aparelho físico. URLs `?v=clouds-4`.

## Nuvens por condição (outubro/2026)

Pedido do usuário: nuvens de chuva escuras. As mesmas duas texturas recebem filtro, céu de fundo e névoa próprios de cada condição, sem novo asset:

| Condição (dia) | Céu | Texto |
| --- | --- | --- |
| Nublado | cinza-azulado claro | escuro |
| Garoa / chuva fraca | cinza (brightness .8) | escuro |
| Chuva moderada / trovoada | ardósia escura (brightness .44) | claro |
| Chuva forte | mais escuro (.38) | claro |
| Trovoada | mais escuro com tom azul-violeta (.34) | claro |

À noite chuva (.29) e chuva forte/trovoada (.25) também escurecem em relação ao nublado (.33). O critério vem de `data-rain` (perfil decorativo da categoria WMO, não taxa observada). Um céu escuro com texto escuro não tem contraste, então `sky-atmosphere` escreve `data-ink`: tinta clara à noite e nos dias escuros de chuva, exceto na janela do crepúsculo, que conserva a tinta escura sobre a luz do amanhecer/pôr do sol. As regras de texto em `continuous.css`/`redesign.css` passaram a usar `data-ink`. `verify-contrast.py` mede doze estados, incluindo garoa, chuva fraca e chuva moderada; os links continuam no azul da marca por contrato, que tem pouco contraste sobre nuvens cinza (já ocorria à noite).

## Velocidade pelo vento (outubro/2026)

O usuário achou o deslizamento rápido demais e pediu que a velocidade acompanhasse o vento. As durações de referência passaram a 460s (véu) e 300s (volume) por tile, valendo para 10 km/h. `sky-atmosphere` recebe o vento atual (`wind_speed_10m`, também da previsão salva na abertura) e aplica `cloudRate` como `playbackRate` nas animações `clouds-*` das duas cenas: 0,4× com ar parado, 1× em 10 km/h e até 2,4× a partir de 33 km/h. `playbackRate` preserva a posição atual, então uma nova leitura muda o ritmo sem pular; a aplicação ocorre no relógio de 30s já existente (sem timer) e alcança animações criadas depois que a folha carrega. Leitura ausente ou inválida volta a 1×: ausência não é calmaria. A direção do vento não é usada; as nuvens continuam indo para a esquerda. É decoração qualitativa, não a velocidade real das nuvens em altitude.

## Nuvens macias, estilo Apple Weather (outubro/2026)

O usuário pediu nuvens "bonitas e realistas" e mandou como referência um print do Apple Weather nublado: céu macio, esfumado, com fiapos longos e degradês suaves de branco e cinza. Uma tentativa intermediária com cúmulos de contorno definido (esferas iluminadas) foi descartada por não corresponder a essa referência. `scripts/generate-soft-clouds.py` foi reescrito:

- **Massas:** ruído espectral alongado na horizontal, com distorção de domínio. Ondulações médias de baixa frequência dão relevo sem granulado.
- **Fiapos:** ruído mais fino e bem alongado, deformado pelo mesmo campo, entra na densidade e na luz. É o detalhe que distingue estas nuvens da versão antiga, "embaçada".
- **Borda:** transição larga, com leve desfoque: esfumada, sem recorte.
- **Luz:** a nuvem logo acima (desfocada e deslocada) acinzenta a base, e as partes finas ficam mais claras. Os tons de cinza são frios, sem puxar para o bege.
- **"Poucas nuvens":** cada camada recebe uma massa macia em 39% (véu) e 46% (volume) de cada meio tile, a 34% da altura, onde a máscara do CSS revela os bancos.
- **Mantidos:** emenda periódica em x, alfa sem perdas de 64 níveis, mesmas regras de CSS, filtros por condição, noite e movimento.
- **Tamanho de arquivo:** 2112 × 704 (3:1 e múltiplo de 16). Com 2100 × 700 o último bloco de 16 px do WebP era parcial, e a última coluna saía da compressão diferente da primeira (degrau na emenda, medido por `verify-clouds.py`).
- **Tamanho:** véu 136,4KiB + volume 109,0KiB = 245,4KiB no precache (antes 343,3KiB).
- **Céu ao redor:** em volta de cada banco do perfil "poucas nuvens", o céu é limpo, para a máscara mostrar uma nuvem só (a cobertura medida pelo QA fica abaixo de 25% mesmo em 2560 × 1080).
- **Versão:** URLs `?v=clouds-5`.

Continua sendo decoração qualitativa: arte original gerada, não foto, sem asset da Apple, e não representa a nebulosidade observada.

## Nuvens para cada condição (outubro/2026)

Pedido do usuário: nuvens próprias para todas as condições com nuvem, em vez das mesmas duas texturas escurecidas por filtro. O gerador produz mais quatro texturas no mesmo estilo macio:

| Textura | Condições | Desenho |
| --- | --- | --- |
| `sky-cloud-overcast.webp` | nublado (WMO 3), neve | estrato contínuo, relevo suave e fiapos, quase sem aberturas |
| `sky-cloud-rain.webp` | garoa e chuva | nimbostrato mais denso, base mais escura, fragmentos macios |
| `sky-cloud-storm.webp` | trovoada | teto pesado, bolsões e mais contraste, sem brilho nas aberturas |
| `sky-cloud-fog.webp` | neblina | faixas baixas horizontais, translúcidas, nas duas camadas (deslocadas) |

- **Onde entram:** substituem o véu na camada de fundo. A camada da frente continua com o volume, e a névoa uniforme atrás continua fechando o céu.
- **Chuva moderada/forte e trovoada:** usam duas cópias deslocadas, como antes.
- **Céu de fundo:** os filtros por condição, a noite e o teto escuro (`data-ink`) não mudaram.
- **Download sob demanda:** as quatro ficam em 1584 × 528, entre 50 e 100KiB cada, **fora do precache**. O navegador só as baixa quando aquele céu aparece, e o SW as guarda no cache em tempo de execução.
- **Offline:** no primeiro dia de uma condição, sem rede, aparece só a névoa da condição atrás do volume, até haver conexão.
- **Testes:** `cache-contract` confere que as quatro existem, são usadas pelo CSS, ficam fora do precache e têm menos de 128KiB. `verify-clouds.py` confere emenda e alfa de todas as seis texturas.
