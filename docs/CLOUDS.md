# Nuvens do Pluvia

Esta evolução usa o céu da referência Apple Weather enviada pelo usuário como direção para nuvens fotográficas, com detalhes suaves e profundidade. Preserva a interface, as cores de leitura e a fonte astronômica existentes; não é uma reprodução da tela da Apple.

## Renderização

`sky.css` reutiliza os dois elementos `.sky-clouds` de cada cena (intro e home). `sky-cloud-veil.webp` forma a camada distante e `sky-cloud-volume.webp` acrescenta volume à frente. São texturas originais geradas, com alpha, comprimidas em WebP de 1120 × 560; não são fotografias observacionais de Manaus nem assets extraídos da Apple.

As imagens não se repetem. Cada superfície tem 64px adicionais de cada lado e altura máxima de 640px. O deslocamento alterna até 32px, com tempos diferentes por camada e easing nas reversões; assim não há emenda de tile nem salto na volta do loop. Não há novo elemento, listener, timer, canvas, shader ou biblioteca.

`data-weather` e `data-phase` continuam sendo determinados por `sky-atmosphere.js`, com a condição da previsão e o relógio astronômico municipal. Opacidade e tonalidade são decorativas: não representam uma medição adicional de nuvens nem uma trajetória meteorológica. Céu limpo/condição desconhecida deixam as camadas transparentes e pausadas. Mudanças de condição suavizam a opacidade por quatro segundos, preservando as animações. Não animar filtros ou máscaras.

O código WMO 1 (predomínio de céu limpo, “céu quase limpo” à noite) recebe `data-clouds="few"` na mesma atualização da condição, tanto na intro quanto na Home. Antes, códigos 1 e 2 compartilhavam também a cobertura densa, contradizendo o texto. O código 1 agora reutiliza as duas texturas em bancos menores nas bordas, com máscaras estáticas que suavizam os recortes; o tamanho considera largura e altura estável do viewport para não encher uma tela em orientação horizontal. Código 2 conserva seu perfil parcialmente nublado. A paleta `data-weather="partly"`, o relógio, os astros e os objetos de animação continuam compartilhados. O perfil volta a `standard` em todas as outras condições, inclusive dados inválidos, e é restaurado pela abertura com cache. Não há nova consulta, asset, nó ou timer.

Essa cobertura é uma representação qualitativa do **mesmo código meteorológico que fornece o texto**, não uma porcentagem observada nem uma foto local. Não usar probabilidade de chuva para preencher nuvens. Os interiores dos bancos esparsos também mantêm opacidade global 1; somente suas bordas e espaços ficam transparentes.

Sol e Lua ficam no nível 1; as nuvens, no 2. Em céu parcialmente nublado, ambas as camadas usam opacidade global 1: o alpha das texturas define sozinho os corpos densos, bordas suaves e espaços abertos. Atenuar a camada inteira a 35–40% fazia os discos atravessarem até regiões densas. À noite, também em nublado/chuva/tempestade/neve, ambas as camadas conservam opacidade global 1 e brightness .34 mantém a leitura sobre os corpos opacos. A Lua do fundo ilustra o ciclo noturno municipal; fase e horários reais do card continuam na efeméride compartilhada. Não diminuir novamente a opacidade global para suavizar nuvens sem verificar a cobertura dos astros. O movimento existente desloca a textura e seus recortes juntos; não há segundo astro, máscara animada ou detector por frame.

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

As novas texturas somam aproximadamente 53% menos bytes que a imagem antiga. Isso descreve os assets, não uma medição de FPS, bateria ou velocidade total do aplicativo. O teste de cache limita a soma a 160KiB.

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

