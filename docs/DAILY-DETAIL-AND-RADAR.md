# Detalhe diário, legibilidade e radar

## Detalhe diário

As sete linhas da previsão abrem um diálogo nativo, usando somente o snapshot já carregado pelo fluxo central em `app.js`. `modules/daily-detail.js` valida valores e seleciona horas pelo **dia municipal**, via `city-time.js`. Calendários não são interpretados no fuso do dispositivo. Dias com DST podem ter 23/25 horas. Amostras duplicadas não contam duas vezes.

Mínima/máxima, sensação, probabilidade máxima e acumulado são campos da previsão diária. Vento e rajadas são máximos **dos horários disponíveis**, com rótulo explícito. Ausência não vira zero; cobertura parcial ou ausência de horas é informada. Não somar um recorte de horas e apresentá-lo como acumulado do dia inteiro.

Os horários reutilizam `hourlyDetail.detail`, inclusive a convenção de precipitação no intervalo que termina na amostra seguinte. Tocar uma hora abre o mesmo diálogo horário existente. A navegação fica limitada ao dia selecionado; o acesso pela Home mantém seu horizonte original de 24 horas. Nascer/pôr do sol reutilizam `PLUVIA.sky.dayAt`, a fonte do fundo e do ciclo solar, para a data escolhida.

Diálogos conservam uma área vertical de scroll, navegação por teclado, foco, animações existentes e reduced motion. Refresh preserva nós dos botões horários, foco e posição horizontal. Trocar cidade invalida os dois detalhes. Dados salvos são identificados. Nenhuma nova API, previsão por minuto, resumo inteligente, planejador ou Nowcast é ativado.

## Radar e custo de trabalho

Radar RainViewer e GOES-East/NASA GIBS continuam os fornecedores existentes. A imagem anterior e seu horário permanecem até chegar ao menos um tile válido da próxima. O evento `load` sozinho pode significar que **todos os tiles falharam**, portanto não basta para confirmar sucesso.

Cada frame pendente tem timeout de 10 segundos. Falha total preserva a imagem anterior, para a reprodução e libera nova tentativa. Falha parcial é explícita; não significa ausência de chuva. Callbacks de frames cancelados não podem substituir o atual. Horário e fonte são confirmados na entrega da imagem, não na solicitação.

Seleções repetidas do mesmo frame não criam camadas. Metadados de radar são reutilizados por dois minutos em memória, com até sete frames recentes, ordenados e sem timestamps repetidos. Tiles continuam usando o cache HTTP do navegador e a política do provedor; não há download antecipado de toda a sequência ou cache de radar no service worker. Frames ausentes podem ser pulados pelos controles; retry é por gesto do usuário.

Resize é coordenado por um único requestAnimationFrame; só dimensões alteradas e não nulas provocam invalidateSize. Uma rajada de dez chamadas é coberta por teste que exige uma medição e uma invalidação. O teste também exige uma única consulta de metadados em radar → satélite → radar dentro do TTL. Isso mede trabalho evitado, **não FPS, bateria ou Core Web Vitals em um iPhone físico**. Animações do céu e a instância única do mapa são preservadas.

## Contraste

Textos comuns preservam branco/cinza à noite e tinta escura durante o dia; acentos continuam #2f6bff. A intro passa a usar tinta mais escura nos textos secundários diurnos e na base clara do crepúsculo. Tempestades diurnas usam tinta mais profunda para textos do topo e leituras. Não recolorir severidades, escalas ou tiles.

`verify-contrast.py` amostra pixels de leituras, notas, fontes, rodapé e textos da intro em nove fundos determinísticos. Exige contraste amostrado de 4,5:1; isso é uma proteção específica de regressão, não certificação de todo o site ou de todos os pixels de uma animação.

## Publicação e validação

Após deploy no Pages, `check-release.cjs` compara SHA-256 do HTML, service worker e JS/CSS locais referenciados com o domínio público. HTTP 200 com conteúdo antigo falha. Retries são limitados e consultam somente os arquivos que ainda falharam.

O job seguinte executa `verify-visual.py` em modo `PLUVIA_PUBLIC_SMOKE=1`, com assets públicos reais e fixtures meteorológicas interceptadas. Confere dia, noite, nascer/pôr do sol e pintura efetiva das leituras/rodapé em mobile e desktop. Somente GET é permitido; Auth, Push e sensores externos ficam bloqueados. Não equivale a testar entrega de e-mail, radar real, permissão GPS ou iPhone físico. O check periódico de serviços externos continua independente.

Validação local/CI:

```sh
node --test tests/*.test.cjs
python scripts/verify-daily-detail.py
python scripts/verify-contrast.py
python scripts/verify-alignment.py
python scripts/verify-visual.py
# Repetir QA de navegador com PLUVIA_BROWSER=webkit.
```

O frontend é JavaScript estático em dist, sem comando de build, lint ou typecheck frontend configurado. CI valida sintaxe e tipos das funções Supabase existentes; esta etapa não altera backend ou banco.

Próxima medição útil: profiling em dispositivo físico, com o céu animado e uma sequência real de radar, sem confundir o resultado de fixtures com cobertura ou disponibilidade dos sensores.

## Faixa provável da temperatura

`#dailyDetailSpread` mostra a faixa 10–90 da máxima/mínima entre os membros do conjunto ICON EPS. `daily-detail.js` continua sem requests: apenas lê `PLUVIA.forecastSpread.peek(cityId)` e repinta no evento `pluvia:forecast-spread` da mesma cidade. A consulta pertence a `forecast-spread.js`, com cliente HTTP próprio, iniciada pelo clique nos dias da previsão. Dias sem membros suficientes ocultam a linha. Leaflet é servido localmente em `vendor/leaflet/` (1.9.4, BSD-2), fora do precache de instalação e com cache de runtime do SW.

