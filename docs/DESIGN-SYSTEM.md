# PLUVIA Design System

Referência do visual atual (novembro/2026). As regras detalhadas e o histórico de cada decisão ficam em `AGENTS.md`; este arquivo resume o sistema para quem vai desenhar ou portar o PLUVIA. Os valores abaixo saem do código publicado (`dist/sky.css`, `dist/styles.css`, `dist/continuous.css`). Se um valor daqui divergir do CSS, vale o CSS.

Existe também um protótipo de referência em React + TypeScript + Tailwind + Framer Motion em `design/dashboard-react/`. Ele **não** é o app: o app é estático (`dist/`) e não usa React. O protótipo serve para portar o desenho para outra base e para testar ideias sem mexer no painel público.

## Princípios

1. O céu manda. Cores, tinta do texto e efeitos seguem a fase do dia e a condição da cidade aberta (`data-phase`, `data-weather`, `data-ink` na raiz), não o tema claro/escuro do aparelho.
2. A informação vem antes do efeito. Nenhum efeito pode baixar contraste, travar a rolagem ou derrubar o Safari do iPhone.
3. Ausência não é zero. Valor ausente aparece como "--"/"—", nunca como "sem chuva" ou "0%".
4. Cor nunca comunica sozinha: severidade, UV e ar sempre têm texto.
5. Números tabulares em horários e listas; a temperatura grande usa algarismos proporcionais.
6. Movimento com propósito, só `transform`/`opacity` (ou pintura), sempre desligado com `prefers-reduced-motion`.

## Paleta

### Céu (fundo fixo atrás de tudo)

| Estado | Degradê | Base |
| --- | --- | --- |
| Noite limpa | `#10142d` → `#080f22` | `#080f22` |
| Dia limpo | `#57b0e2` → `#bce7f5` → `#a7d7ec` | `#a7d7ec` |
| Dia nublado (WMO 3) | `#909db0` (prata) | `#909db0` |
| Dia com chuva/trovoada | `#30343a` → `#212428` | `#26292d` |
| Noite com chuva | `#24282e` → `#1b1e23` | `#1b1e23` |
| Noite nublada | `#0b1229` → `#1a2246` | `#0b1229` |

### Texto e marca (por tinta)

| Token | Tinta clara (noite, chuva) | Tinta escura (dia claro) |
| --- | --- | --- |
| `--reading-ink` (texto) | `#f2f7ff` | `#082744` |
| `--reading-muted` (secundário) | `#cbdceb` | `#173c58` |
| `--reading-line` (divisória) | `#b8d4ef30` | `#12345730` |
| `--brand-blue` (destaque, links, "Agora") | `#7cc0ff` | `#0a4cba` |
| `--on-accent` (texto sobre o azul) | `#0c1a33` | `#ffffff` |

Branco puro (`#ffffff`) é o texto das janelas escuras e dos botões preenchidos à noite. Não aplicar o azul a todo o conteúdo: ele marca destaque.

### Cartões

| Estado | Fundo | Borda |
| --- | --- | --- |
| Noite | `#141c33` (sólido) | `rgba(190,210,245,.13)` |
| Dia | `rgba(232,242,252,.8)` (azulado, o céu aparece de leve) | `rgba(255,255,255,.55)` |
| Dia com chuva | `#242b36` | `rgba(255,255,255,.14)` |
| Noite com chuva | `#1d2129` | `rgba(255,255,255,.12)` |

Janelas (diálogos): de dia `#f7f5f0` com cartões brancos e texto `#13233d`; à noite preto `#000` com cartões `#ffffff12` e secundário `#a1a1a6`.

### Alertas (INMET)

| Severidade | Faixa | Texto |
| --- | --- | --- |
| Amarelo (perigo potencial) | `#f3d046` | `#2b2200` |
| Laranja (perigo) | `#f08c1e` | `#1a0d00` |
| Vermelho (grande perigo) | `#b3261e` | `#ffffff` |

Laranja e vermelho são as únicas cores "vibrantes" fora da marca. Tempestade no céu não vira laranja: a cor de alerta é reservada para aviso oficial.

### Gráficos

- Faixa de temperatura: `#32b8ff` (frio) → `#ffd34a` → `#ff762f` (quente), numa escala comum aos 7 dias.
- Chuva: `#22b8ff` → `#2673ff`; altura só pelo volume (raiz de mm até 10 mm). A chance fica no número e nunca aumenta a barra.
- Vento: `#1bddda` → `#138be1`.
- Ok/atenção/erro em listas técnicas: `#20a66a` / `#ffad66` / `#ff776d` (claro) e `#4cdb9c` / `#ffba75` / `#ff9189` (escuro).

## Tipografia

- **Sora** (Google Fonts, variável 100–800, subconjunto Latin servido localmente em `assets/fonts/`) para todo o texto e números. A temperatura grande usa a mesma família em **peso 200**: o contraste vem do peso e do tamanho, não de uma segunda família.
- **Nunito 900** só nas três assinaturas "PLUVIA" (intro, cabeçalho, rodapé).

Por que não "uma fonte marcante para temperatura e outra para texto": duas famílias de dados na mesma tela disputam atenção e o número muda de desenho entre o topo, as horas e os dias. A Sora foi escolhida pelo dono (1.43) vendo cinco candidatas aplicadas no app; trocar exige novo pedido.

| Uso | Tamanho | Peso |
| --- | --- | --- |
| Temperatura do topo | `clamp(5.35rem, 24.5vw, 7.5rem)`, grau `.72em` | 200 |
| Cidade | `clamp(1.9rem, 8.7vw, 2.65rem)` | 400 |
| Condição e linha Sensação/Máx./Mín. | `clamp(1.05rem, 5vw, 1.25rem)` | 500 |
| Título de seção | `1.3rem` | 600 |
| Texto | `1rem` | 400 |
| Rótulos e notas | `.8125rem`–`.875rem` (mínimo 13 px) | 400 |

A base acompanha o Tamanho do Texto do iPhone (14–22 px) e o ajuste A−/A+ do app; tudo visível usa `rem`.

## Espaço, forma e alvos

- Escala de espaço: 4, 8, 12, 16, 24, 32, 48, 64 px. Respiro generoso entre seções (16 px no celular, 24 px no desktop).
- Raios: 12 px (botões), 20–22 px (cartões e folhas), pílula para busca e seletores.
- Alvo mínimo de toque: 44 × 44 px (bolinhas de cidade 24 × 44 px, mínimo da WCAG 2.5.8).
- Largura máxima: 860 px; 1180 px a partir de 1100 px, com duas colunas.

## Arquitetura da interface

### Celular (até 720 px), uma coluna

```
┌──────────────────────────────┐
│ (conta)    PLUVIA   (⤴)(🔍)  │  cabeçalho: alvos de 44 px, marca no centro
├──────────────────────────────┤
│           Manaus             │
│            31°               │  topo fixo: cidade, número, condição
│     Parcialmente nublado     │
│   Sensação 36° Máx 33° Mín 24│
│ [faixa de aviso INMET]       │  só com aviso vigente/previsto
├──────────────────────────────┤
│ Próximas horas  [Cond|Chuva|Vento]
│  Agora 15h 16h 17h …  ←→     │  24 horas, 6,5 itens à vista
│ 7 dias (dentro do mesmo cartão)
├──────────────────────────────┤
│ Dicas: "Vai chover?" primeiro│  frase contextual
├──────────────┬───────────────┤
│ Sensação     │ Máx./mín.     │  grade 2 colunas, linhas por subgrid
│ Visibilidade │ Umidade       │
│ Vento        │ Pressão       │
│ UV (largura toda) · Ar        │
├──────────────────────────────┤
│ Radar · Ciclo do dia · Lua   │
└──────────────────────────────┘
```

A busca não fica fixa no topo: a lupa abre "Suas cidades" (folha de baixo para cima) com campo, voz, "Usar minha localização", favoritas e recentes. Digitando, os resultados sobem para logo abaixo do campo (o teclado escondia a lista).

### Desktop (a partir de 1100 px), duas colunas

Topo fixo centralizado; abaixo, coluna esquerda com horas, radar e 7 dias, coluna direita com resumo, leituras e céu (`modules/home-layout.js`). A pessoa pode reordenar e esconder seções em "Personalizar a Home".

### Componentes principais

| Bloco | O que mostra | Onde |
| --- | --- | --- |
| Busca | autocomplete com acentos/apelidos (bh, sampa, floripa), recentes, favoritas, voz, localização só por toque | `#cityDialog`, `capitals.js` |
| Topo | cidade, temperatura, condição (observação vence o modelo quando há medida), Sensação/Máx./Mín. | `app.js` |
| Frase contextual | "Vai chover?" com regra fixa: chuva = ≥ 0,5 mm ou ≥ 50% com volume nas próximas 12 h; possibilidade = ≥ 30%; trovoada pelos códigos 95/96/99 | `weatherInsights.rainAnswer` |
| Grade | umidade (faixa Defesa Civil), UV (barra + classe), vento (velocidade, rajadas, bússola), sensação, máx./mín., visibilidade, pressão, ar | `.metric-sky` |
| Próximas horas | Condição / Chuva / Vento, nascer e pôr do sol como coluna própria | `section#chuva` |
| 7 dias | dia, ícone, chance (só ≥ 20%), mínima-barra-máxima numa escala comum | `#previsao` |

Chance de chuva por hora e por dia vale para o intervalo que **começa** na hora mostrada (Open-Meteo guarda no fim: lê-se `i+1`).

## Vidro (glassmorphism)

O vidro com desfoque existe só em **controles pequenos**: botões do topo, cápsula da busca, ações de "Suas cidades", seletor Condição/Chuva/Vento, ⓘ e a pílula do cabeçalho compacto (`backdrop-filter` com blur de 6–16 px, saturação, borda de luz em cima e embaixo; lente com refração só no Chromium).

Cartões **não** têm desfoque. Um `backdrop-filter` por cartão sobre as nuvens animadas é refeito a cada quadro e derrubou o Safari do iPhone ("Um problema ocorreu repetidamente"). A sensação de vidro dos cartões vem de cor translúcida, borda fina e o céu contínuo atrás. `prefers-reduced-transparency` troca o vidro por fundo sólido.

## Movimento

| Pedido comum | Como é no PLUVIA | Por quê |
| --- | --- | --- |
| Entrada em cascata (fade + slide-up) | Na troca de cidade os blocos "descem" um depois do outro (240 ms, passo de 70 ms) por `top` + `clip-path`, sem camada nova; a cidade, o número e a condição deslizam por View Transition | `transform`/`opacity` em blocos inteiros criava dezenas de camadas e travava o iPhone ao girar a tela |
| Chuva caindo no fundo | Duas camadas de traços SVG (perto/longe) num tile de 480 px que desce um tile por ciclo; traço inclinado com vento ≥ 25 km/h | Só `transform`; densidade pelo código WMO, nunca pela probabilidade |
| Flashes de raio | Clarão do céu inteiro + canal ramificado que cresce de cima para baixo, ciclo de 39 s com três quedas, pico limitado a 0,34 | Texto continua legível; nas nuvens 3D o raio acende o miolo |
| Hover com brilho neon pulsante | **Não nos cartões de leitura.** Hover só onde há ação (linhas dos 7 dias, horas, botões) | Brilho em cartão que não abre nada sugere clique que não existe; o dono recusou bordas de luz e brilho nos cantos |
| Autocomplete com mola | Folha de "Suas cidades" entra de cima e sai para baixo (`dialog-motion.js`); resultados sobem para perto do campo | Mantém foco e top layer até a saída terminar |
| Seletor de horas de vidro | Seletor Condição/Chuva/Vento com bolha de vidro que segue o dedo (`glass-segment.js`); soltar escolhe, o arraste não envia nada | Mesma física dos botões de vidro (`glass-touch.js`: mola de 620 ms ao soltar) |

Tudo para com a página oculta e com a cena fora da tela; `prefers-reduced-motion` deixa o céu parado e remove as transições.

## Proibido sem novo pedido do dono

- React, bundler ou ES modules no app publicado (`dist/`).
- `backdrop-filter` em cartões e blocos grandes; blur animado; canvas/WebGL fora das nuvens volumétricas.
- `transform`/`opacity`/`z-index` em seções inteiras.
- Hover que mexe em cartão de leitura.
- Trocar a Sora, voltar ao azul vivo `#2f6bff` nos destaques, recolorir ícones meteorológicos ou escalas de fornecedores.
- Emoji como ícone de condição (use `PLUVIA.weatherIcons`).

## Protótipo React (`design/dashboard-react/`)

Implementa as mesmas regras com Vite, React 19, TypeScript estrito, Tailwind 4 (tokens desta página em `@theme`) e Framer Motion:

- busca em combobox acessível com debounce, cancelamento, recentes (storage protegido) e localização só no toque;
- topo com frase contextual pela regra do "Vai chover?";
- grade de métricas: cada cartão é um botão que troca a lente da fileira de horas, então o hover (escala 1,02 + brilho pulsante, só com mouse) tem uma ação por trás;
- fileira de 24 horas com bolha de vidro arrastável que assenta por mola, com `role="slider"` e setas no teclado;
- 7 dias com escala comum e detalhe que abre pela altura;
- céu fixo com chuva e raio em CSS (só `transform`/`opacity`, pausa com a página oculta);
- testes (Vitest) do adaptador Open-Meteo (`i+1`, fuso da cidade, ausência ≠ zero) e da frase de chuva.

```sh
cd design/dashboard-react
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # typecheck + build
```

## Checklist de componente novo

- resolve um problema concreto e respeita a hierarquia (topo > horas/dias > leituras > céu);
- tem estados de carregamento (esqueleto parado no toque), vazio, erro e leitura salva identificada;
- funciona por teclado e toque, alvo ≥ 44 px, nome acessível contém o texto visível;
- não depende só de cor e passa em `scripts/verify-contrast.py` nos céus claros e escuros;
- só `transform`/`opacity` ou pintura, nada de camada nova por bloco; reduced-motion coberto;
- mantém fonte, horário e tipo do dado (modelo, radar, estação, aviso oficial).
