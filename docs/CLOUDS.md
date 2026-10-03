# Nuvens do Pluvia

Esta evolução usa o céu da referência Apple Weather enviada pelo usuário como direção para nuvens fotográficas, com detalhes suaves e profundidade. Preserva a interface, as cores de leitura e a fonte astronômica existentes; não é uma reprodução da tela da Apple.

## Renderização

`sky.css` reutiliza os dois elementos `.sky-clouds` de cada cena (intro e home). `sky-cloud-veil.webp` forma a camada distante e `sky-cloud-volume.webp` acrescenta volume à frente. São texturas originais geradas, com alpha, comprimidas em WebP de 1120 × 560; não são fotografias observacionais de Manaus nem assets extraídos da Apple.

As imagens não se repetem. Cada superfície tem 64px adicionais de cada lado e altura máxima de 640px. O deslocamento alterna até 32px, com tempos diferentes por camada e easing nas reversões; assim não há emenda de tile nem salto na volta do loop. Não há novo elemento, listener, timer, canvas, shader ou biblioteca.

`data-weather` e `data-phase` continuam sendo determinados por `sky-atmosphere.js`, com a condição da previsão e o relógio astronômico municipal. Opacidade e tonalidade são decorativas: não representam uma medição adicional de nuvens nem uma trajetória meteorológica. Céu limpo/condição desconhecida deixam as camadas transparentes e pausadas. Mudanças de condição suavizam a opacidade por quatro segundos, preservando as animações. Não animar filtros ou máscaras.

O controlador `observeMotion` existente pausa cenas fora da área visível e no background. `prefers-reduced-motion` conserva o céu estático e remove transições. O filtro noturno evita deixar nuvens brancas muito iluminadas; chuva e tempestade mantêm os seus próprios efeitos.

Na home, a luz do crepúsculo recebe uma atenuação estática quando o relógio municipal já está no período noturno, para conservar contraste com o texto branco. O horário, o peso da transição e o céu da intro continuam na implementação astronômica existente.

## Tamanho e cache

Medidas dos arquivos desta implementação:

| Asset | Bytes |
| --- | ---: |
| Véu | 45.420 |
| Volume | 75.786 |
| Total novo | 121.206 |
| Imagem antiga | 255.734 |

As novas texturas somam aproximadamente 53% menos bytes que a imagem antiga. Isso descreve os assets, não uma medição de FPS, bateria ou velocidade total do aplicativo. O teste de cache limita a soma a 160KiB.

O SW atual `pluvia-panel-61` guarda ambas e `sky.css?v=sky-9`. O antigo `sky-cloud-bank.webp` continua servido por compatibilidade com shells antigos, mas sai do precache atual; só deve ser removido numa limpeza que considere instalações legadas. A evolução posterior de chuva e raios está em [RAIN-AND-LIGHTNING.md](RAIN-AND-LIGHTNING.md).

## Verificação

- `node --test --test-isolation=none tests/*.test.cjs`: contratos meteorológicos, astronomia, cache e regressões existentes.
- `python scripts/verify-clouds.py`: onze condições em cinco viewports (320 × 740, 390 × 844, 844 × 390, 1366 × 768 e 2560 × 1080), decode das imagens, duas superfícies limitadas, leitura principal, ausência de overflow, animações preservadas, pausa fora da tela/tempo limpo e reduced-motion. Também amostra chuva e raios.
- `PLUVIA_BROWSER=webkit python scripts/verify-clouds.py`: mesma verificação em WebKit instalado.
- `python scripts/verify-visual.py`: estados gerais e diálogos; integra-se ao workflow de interface junto do novo QA.

Os screenshots usam previsões fictícias e horário municipal fixado, com dispositivo em Asia/Tokyo. Não comprovam sensores reais, hardware iPhone, FPS ou consumo energético. Revisão visual documentada em `design-qa.md`.
