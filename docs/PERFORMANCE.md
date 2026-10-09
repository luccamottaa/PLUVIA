# Performance e acessibilidade da Home (Lighthouse, outubro/2026)

## Como foi medido

- Lighthouse 12.8 com Chromium local, por `puppeteer-core`, fora do repositório e sem nova dependência.
- O Open-Meteo, o CAMS, o INMET, o MET e o RainViewer foram interceptados com fixtures de Manaus no horário atual. Nenhuma API real foi consultada.
- Primeira visita: sem cidade salva, sem sessão e sem cache do service worker, com a intro já vista.
- Perfis:
  - celular: padrão do Lighthouse, Moto G com 4G lento simulado e CPU 4×;
  - desktop: preset `desktop`.
- "Antes" é a `main` com o modo offline (#146). "Depois" inclui skeleton, "Vai chover?", dicas e as correções abaixo.
- Cada perfil rodou de 2 a 3 vezes. A tabela mostra o intervalo.

| Perfil | Métrica | Antes | Depois |
|---|---|---|---|
| Celular | Performance | 46–51 | 60–67 |
| Celular | CLS | 0,37 | 0,023–0,038 (uma rodada isolada: 0,11) |
| Celular | LCP observado (sem simulação) | 2,05 s | 0,71 s |
| Celular | Requisições ao Open-Meteo na 1ª visita | 2 | 1 |
| Desktop | Performance | 80 | 90 |
| Desktop | CLS | 0,18–0,20 | 0–0,004 |
| Ambos | Acessibilidade / Boas práticas / SEO | 100 / 100 / 100 | 100 / 100 / 100 |

Acessibilidade automática já estava em 100. Isso cobre labels, contraste das amostras, nomes de botão, ordem de títulos e atributos ARIA. Não cobre leitor de tela real, navegação por teclado completa nem hardware iOS. Esses pontos continuam com o QA existente (`verify-*.py`) e o teste manual.

## O que causava os saltos e o que mudou

1. **Aviso "Localização indisponível"**, responsável pelo CLS 0,25 no celular.
   - Era inserido no topo 1,5 s depois do primeiro paint e empurrava a página inteira.
   - Agora o texto vem no HTML e um script inline o mostra no primeiro paint quando não há cidade salva.
2. **Skeleton das Próximas horas**, com 96 px enquanto o conteúdo real tem 205–241 px.
   - O skeleton passou a usar as mesmas classes do item real (`hourly-peek-item sk-peek` com `peek-*`), então a altura vem do mesmo CSS.
3. **Card INMET carregando** reserva a linha da leitura (`#inmetContent:empty`).
4. **Status "Atualizando…"** aparecia e sumia em 300 ms com uma leitura de minutos atrás.
   - Somente a leitura gravada pelo prefetch desta mesma abertura aparece como atual enquanto atualiza.
   - Uma regra anterior, "menos de 10 min", escondia por até ~30 s o status de leitura salva quando a rede travava num recarregamento. O WebKit da CI pegou o problema.
   - Offline ou leitura mais antiga continuam com o status visível.
5. **Skip link**: até o `styles.css` (assíncrono) chegar, ele ocupava 20 px no fluxo e depois subia a página. O posicionamento foi para o CSS crítico inline.
6. **Coluna do desktop**: antes do `styles.css`, o `main` ocupava a largura toda.
   - Elementos escondidos que mudam de lugar também contam como layout shift, então o `visibility:hidden` não evitava isso.
   - O CSS crítico agora define a coluna base (`.shell` até 1180 px, centralizada). O `styles.css` e as folhas seguintes refinam por viewport.
7. **Previsão baixada duas vezes**: a 1ª carga reaproveita a Promise do `prefetchForecast` da mesma cidade.
   - Vale até 2 min e é consumida uma vez.
   - Se ela falhar, cai na consulta normal.
8. **Espera fixa de 1,5 s** na primeira visita.
   - Só serve para uma conta restaurada aplicar a cidade principal.
   - Sem sessão Supabase salva nem retorno OAuth na URL, Manaus é escolhida na hora.

## Segundo passo (PageSpeed, outubro/2026)

Medido com o mesmo Lighthouse local e fixtures (celular e desktop, duas rodadas cada).

1. **SDK do Supabase só quando pode haver conta.**
   - Antes, todo visitante baixava `vendor/supabase-2.116.0.js` (~210 KiB, 178 KiB sem uso) na abertura.
   - Agora `account.js` só restaura a sessão na abertura quando existe a chave do Supabase (`sb-<projeto>-auth-token`) ou a URL traz retorno de login, confirmação ou recuperação (`auth_return`, `auth_recovery`, `code`, `access_token`, `error`). Storage bloqueado conta como "pode haver sessão".
   - Sem isso, a conta aparece deslogada (o evento `pluvia:auth-changed` sai com `user:null`) e o SDK carrega quando a pessoa abre a conta, entra ou usa notificações.
   - Teste: `tests/account-lazy-sdk.test.cjs`. O QA de conta (`verify-account-sync`, `verify-account-lifecycle`, `verify-auth-redirects`) continua passando.
   - Resultado: "JavaScript não usado" caiu de ~199 KiB para ~21 KiB (resta `weather-map.js`); nota de performance no celular subiu de ~61 para ~69.
2. **Marca em WebP.** As máscaras da gota (intro, cabeçalho e rodapé) usam `logo-mark.webp` (7 KiB, alfa sem perdas e idêntico ao PNG) em vez do PNG de 35 KiB. O PNG fica para o badge do Push.
3. **Pulso invisível.** O `.live-dot` pulsava (`box-shadow`, repintura a cada quadro) dentro do status que só aparece para dado antigo, quando o pulso já é desligado. Fora desse estado a animação agora fica parada.

Tentativas medidas e descartadas:

- **`redesign.css` e `continuous.css` assíncronas** (como o `styles.css`). Ao trocar `media=print` por `all`, o Chrome reprocessa a folha de forma assíncrona: a página aparecia um quadro sem estilo e o CLS do desktop foi a 0,10–0,78.
- **As três folhas no `body`, depois da intro.** Sem salto, mas o Lighthouse continua contando como bloqueantes e o FCP do celular piorou (2,3 → 2,9 s).
- **`preload` do `styles.css`.** FCP 2,3 → 3,1 s e CLS 0,04–0,05.

## Fluidez no celular (outubro/2026)

Medido no Chromium com 390×844, DPR 3 e CPU 4× mais lenta (fixtures, mesmo método das seções anteriores). Camadas de composição contadas pelo `LayerTree` do DevTools; o tamanho é largura × altura × 4 bytes × DPR², antes do recorte em tiles, então serve para comparar, não como memória real do iPhone.

- **Camadas invisíveis saíam da tela, mas não da memória.** Nuvens com céu limpo, chuva sem chuva e estrelas de dia ficavam com opacidade 0 e animação pausada, mas continuavam compostas (cada nuvem 1710×440 px ≈ 27 MB em DPR 3). Agora recebem `visibility:hidden` **depois** do fade (`visibility 0s <duração do fade>`), e aparecem na hora quando voltam. Céu limpo de dia: ~208 → ~154 MB; noite limpa: ~299 → ~190 MB. A transição de `visibility` não tem duração (só atraso): com duração ela fazia o Chrome recalcular estilo a cada quadro por 4 s (39 → 219 recálculos na abertura).
- **Ritmo das nuvens no próximo quadro.** `syncCloudRate` lia `getAnimations()` logo depois de escrever o estado do céu, forçando um recálculo de estilo da página inteira (~170 ms com CPU 4×). No navegador o `playbackRate` vai para o próximo `requestAnimationFrame`, quando esse cálculo já acontece; sem rAF (testes) continua síncrono.
- **Escritas iguais não se repetem.** O relógio de 30 s reescrevia os mesmos `data-*` e variáveis em root/body; valores idênticos agora são pulados, sem invalidar estilos herdados.
- **Gráfico por hora sob demanda.** O gráfico de 24 colunas fica dentro de `#hourlyChartDetails`, recolhido. Fechado, ele não é montado (`data-pending`); ao abrir (`toggle`) é desenhado com a previsão atual. A janela seca, fora dele, continua atualizada. Nós do DOM na abertura: 1552 → 1312; trabalho de JS da primeira renderização: ~490 → ~230 ms (CPU 4×).
- **Story liberado.** O canvas de 1080×1920 (~8 MB) é zerado depois de virar PNG.
- **Sem `:has()` no body.** `body:has(.city-dialog[open])` virou a classe `city-dialog-open`, posta ao abrir e tirada no `close` do diálogo.

**Celular deitado.** Com 844×390 (DPR 3) a estimativa subia de ~310 para ~658 MB: as nuvens cresciam para 2620×590 px (70vw) e, acima de 720 px, voltavam as animações de entrada (`rise-in`) e a revelação ao rolar, que deixavam o hero composto e a seção seguinte (802×3362) como camada por sobreposição. Agora toque não usa essas animações e a altura das nuvens é limitada por `113vh` (440 px deitado; em pé e no desktop não muda). Resultado: ~474 MB, sem as camadas do hero/seções.

Não mexido: as nuvens visíveis ainda têm máscara própria (camada extra do mesmo tamanho). Mover a máscara para um contêiner estático reduziria a memória, mas mexe no contrato das nuvens e no QA de pixels; fica como próximo passo se o iPhone ainda pesar com tempo nublado/chuva.

## Troca de cidade e movimentos suaves (outubro/2026)

Mesmo método (390×844, DPR 3, CPU 4×), medindo tarefas longas e intervalos entre quadros durante cada interação e o perfil de CPU/trace da troca de cidade pelas bolinhas.

- **Formatadores guardados.** `renderSun`, `formatUpdateTime`, eventos do céu, favoritos e detalhes criavam um `Intl.DateTimeFormat` (ou `toLocaleString` com opções) a cada número/horário. `PLUVIA.time.dateFormat/numberFormat` guardam por idioma + opções (cache de 96). `render()` na troca: ~273 → ~125 ms.
- **Variáveis do céu nas cenas.** Escritas em `<html>`/`<body>`, cada mudança de `--sun-orbit-x`, `--rain-opacity` etc. recalculava o estilo dos ~500 elementos da página (o trace mostrava “Inline CSS style declaration was mutated” em HTML/BODY, 10 por troca). Agora vão para `.intro-sky`, `.sky-effects` e `.sky-twilight-page`, os únicos consumidores. Recálculo de estilo na troca: ~561 → ~334 ms.
- **`getAnimations()` só quando precisa.** A leitura das animações das nuvens forçava ~160–240 ms de estilo a cada troca, mesmo com o mesmo vento. Agora roda quando o ritmo muda ou quando o CSS cria animações de nuvem (`animationstart`).
- **`<details>` pela altura.** Gráfico, “Mais sobre o céu”, ar, conta e rodapé abriam de uma vez (e a entrada antiga animava transform/opacity em cada filho). Agora a altura cresce e encolhe por `grid-template-rows` (340 ms), como o ⓘ: só layout, sem camadas.
- **Bolinhas reaproveitadas.** A lista era recriada a cada troca, então a transição nunca acontecia; agora só `aria-current` muda e a atual vira uma pílula pela largura.
- **Onde não havia movimento.** Véu ao tocar botões (sombra interna, só pintura), bússola pelo menor caminho, UV e Sol/Lua deslizando, barras do gráfico crescendo por altura ao abrir/trocar o modo e fade de cor ao navegar nos detalhes. Medido: abrir o gráfico com as barras crescendo fica em 17 camadas (as mesmas do gráfico aberto); trocar o modo sobe a 20 por menos de 1 s e volta.

Tarefas longas somadas na troca para a cidade seguinte: ~776 → ~550 ms; volta: ~377 → ~210 ms (CPU 4×; num celular real ≈ ¼ disso). O que sobra é o recálculo de estilo/layout da troca de conteúdo (esqueletos → dados) e a própria View Transition; o deslize em si roda no compositor.

## Abertura no iPhone (outubro/2026)

Gravação de tela do usuário (iPhone, PWA instalado, 60 fps): dentro da intro nenhum quadro passou de 17 ms; o que parecia travado era a abertura. Antes da intro, ~1 s de tela preta e um clarão que chegava a cinza claro (~170 ms: a página ainda sem pintura). E toda volta ao app depois de ~1 s em segundo plano era uma abertura nova, com a intro inteira de novo.

- **Intro pinta antes.** `redesign.css` e `continuous.css` (145 KB, só da Home) saíram do `<head>` para logo depois da intro. A intro depende só do CSS inline e do `sky.css`. Primeiro desenho com SW e CPU 4× (Chromium, mediana de 7): ~436 → ~344 ms. O conteúdo da Home continua só aparecendo com o CSS pronto.
- **Intro não repete a cada volta.** Só repete 3 h depois da última; nas voltas o app abre direto na previsão.
- **Menos memória em segundo plano.** O céu sai da composição enquanto a página está oculta (só `visibility`, animações pausadas no mesmo ponto): estimativa das camadas ~260 → ~59 MB. Um app com menos memória em segundo plano tende a ser encerrado menos pelo iOS, mas isso só se confirma no aparelho.

## Limites e o que não foi mexido

- **LCP simulado de ~10 s no celular.**
  - É a estimativa do Lighthouse com CPU 4× mais lenta.
  - O elemento medido é a camada decorativa de nuvens, que aparece quando a previsão chega.
  - O LCP observado no mesmo teste foi 0,71 s.
  - Não escondemos a nuvem do LCP nem atrasamos a decoração para "ganhar nota".
- **Main thread.** O trabalho principal é estilo/layout de um documento grande (~56 KB de HTML com SVGs) e scripts clássicos.
  - Reduzir isso exige dividir a Home ou adiar seções.
  - É uma mudança de arquitetura, fora deste passo.
- **Shifts restantes de até 0,013**: a temperatura (DIV 111→135 px) e a linha do INMET ao trocar de `loading` para `clear`.
- **Variação**: uma rodada isolada no celular deu CLS 0,11 em Próximas horas. Não reproduziu em 4 medições instrumentadas.
