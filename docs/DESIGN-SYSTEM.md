# PLUVIA Design System

## Princípios

1. A informação meteorológica vem antes do efeito visual.
2. Cor nunca comunica risco sozinha: todo estado possui rótulo textual.
3. A atmosfera pode responder ao clima, mas não pode reduzir contraste, desempenho ou autonomia.
4. Modelo, radar, satélite, observação e aviso oficial mantêm rótulos distintos.
5. Valores usam números tabulares; unidades têm peso visual secundário.

## Tokens

Os tokens ficam em `dist/styles.css` e são a única fonte para cores, espaçamento, raios e sombras.

- Superfícies: `--bg`, `--bg-secondary`, `--panel`, `--panel-strong`, `--panel-subtle`.
- Conteúdo: `--text`, `--muted`, `--disabled`, `--line`.
- Marca: `--brand-blue`, `--blue`.
- Estados: `--ok`, `--orange`, `--danger`.
- Meteorologia: `--weather-rain`, `--weather-heavy-rain`, `--weather-storm`, `--weather-lightning`, `--weather-heat`, `--weather-cold`, `--weather-wind`, `--weather-snow`, `--weather-uv`, `--weather-air`, `--weather-smoke`.
- Espaçamento: escala de 4, 8, 12, 16, 24, 32, 48 e 64 px.
- Raios: `--radius-sm`, `--radius-md`, `--radius`, `--radius-lg`.

## Hierarquia de superfícies

- `card-primary`: condição atual, chuva e outros dados de decisão imediata.
- `card-secondary`: interpretação, saúde e contexto.
- `card-detail`: métricas complementares, com profundidade visual reduzida.
- `card-interactive`: superfície com expansão ou ação; recebe realce em foco.

Cards de leitura não ganham movimento no hover. Isso evita sugerir clique onde não existe ação.

## Componentes

### WeatherHero

Prioriza temperatura, condição, sensação, máxima/mínima, chuva atual, fonte e atualidade. O atributo `data-weather` no `body` permite atmosfera discreta por condição; `data-phase` separa dia e noite.

### InsightCard

“Agora no PLUVIA” interpreta o conjunto de chuva, vento, calor e umidade. Não substitui o PLUVIA Sinal e não cria evento sem dados suficientes.

### PLUVIA Sinal

Usa os estados `good`, `attention`, `wait`, `danger` e `unknown`. O rótulo, a explicação, os fatores, a confiança e o horário do modelo são obrigatórios.

### MetricCard

Exibe rótulo, valor, unidade secundária e interpretação curta. Vento inclui direção acessível; AQI e UV usam cor apenas como reforço.

### RainTimeline

Cada hora informa horário, temperatura, probabilidade, volume e condição. O título textual mantém esses dados disponíveis sem depender da barra.

### AlertCard e AQICard

Alertas preservam fenômeno, severidade, vigência, área e fonte. Ausência de alerta é diferente de falha de consulta. AQI sempre combina índice, categoria e orientação prática.

### SunArc

Mostra nascer, duração do dia, posição aproximada e pôr do sol. À noite muda a linguagem visual, sem aumentar sua prioridade na home.

### WindCompass

Aponta a direção informada pela fonte e fornece descrição completa por `aria-label`. A rosa visual nunca substitui direção, velocidade e rajadas em texto.

### WeatherMap e RadarTimeline

Controles têm alvo mínimo próximo de 44 px. Cada camada mostra nome, fonte e horário. Previsão de modelo nunca recebe rótulo de radar ou observação.

### Skeleton, EmptyState e ErrorState

Skeletons preservam o espaço final. Empty state descreve ausência do fenômeno. Error state descreve indisponibilidade, mantém o último dado válido com horário quando possível e oferece nova tentativa no contexto apropriado.

## Responsividade e movimento

- 320–380 px: métricas em uma coluna quando necessário; hero compacto sem perder a temperatura.
- 390–720 px: experiência mobile em duas colunas para métricas, cards principais empilhados e timeline horizontal com snap suave.
- 768–1024 px: grade intermediária existente.
- 1440 px+: largura de leitura limitada a 1180 px.
- `prefers-reduced-motion` remove animações e transições não essenciais.
- Em mobile, blur contínuo e elementos atmosféricos pesados continuam desativados.

## Checklist de novos componentes

- melhora compreensão e hierarquia;
- possui estado loading, vazio, erro e stale quando aplicável;
- funciona por teclado e toque;
- não depende só de cor;
- mantém fonte, timestamp e tipo do dado;
- respeita resolução e confiança da fonte;
- não adiciona animação contínua sem função.
