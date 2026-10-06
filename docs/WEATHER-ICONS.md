# Ícones meteorológicos do PLUVIA

A família de condições usa 22 SVGs originais, estáticos e transparentes. As nuvens têm volume por gradientes; Sol dourado, Lua prateada, gotas azuis e raios distinguem as condições sem depender apenas da cor. Não são imagens de observações meteorológicas nem a fase lunar real.

`dist/modules/weather-icon-system.js` continua responsável por código WMO, variantes dia/noite, nomes, labels e markup acessível. Previsão horária, diária e seus detalhes reutilizam o mesmo catálogo. A troca de arte não altera modelos, dados, horários ou regras meteorológicas. Mapa e efemérides mantêm seus símbolos existentes.

Os 16 indicadores também usam volume discreto por gradientes: termômetros, sensação com ondas de calor, máxima/mínima com setas, gota, olho, vento, manômetro, UV com proteção e folha para qualidade do ar. Contornos mantêm a leitura sobre fundos claros. A arte é simbólica: cores dos termômetros/folha não classificam a leitura, a seta ilustrada não fornece direção real e não substitui a bússola dinâmica ou escalas meteorológicas.

Sensação, máxima e mínima reutilizam os nomes `feels-like`, `temperature-high` e `temperature-low` que já existiam no catálogo. Os três títulos têm a mesma estrutura visual: ícone decorativo de 28px acima do label e valor abaixo, sem truncar o texto em 320px. O ícone fica dentro de `.metric-head`; não voltar a ocultá-lo nem colocar somente um deles ao lado do número. Não duplicar leituras ou labels acessíveis.

- WMO 1 usa uma nuvem menor que WMO 2, com variantes diurna/noturna.
- Céu encoberto tem duas camadas de nuvens; chuva forte tem nuvem mais escura e mais gotas que chuva fraca/moderada. Garoa tem gotas menores.
- Trovoadas (95) usam raio sem acrescentar chuva; granizo tem partículas próprias. Probabilidade não escolhe intensidade.
- A Lua dos ícones é um símbolo noturno. O disco e a fase astronômica do fundo continuam em `moon-view.js`/`sky-atmosphere.js`.

Regenerar com `node scripts/generate-modern-weather-icons.cjs`. O gerador conserva o catálogo e inclui apenas os gradientes utilizados por cada arquivo. Não editar SVGs gerados isoladamente, adicionar filtros/blur/animação, fontes externas ou imagens raster. O limite é 4 KiB por condição/indicador, 50 KiB para as 22 condições e 96 KiB para condições + indicadores, sem os assets legados que continuam disponíveis para shells antigos.

Versões dos assets, módulo, referência HTML e precache precisam avançar juntas com a geração do SW. Símbolos auxiliares que não mudaram conservam os mesmos bytes. Nenhuma consulta meteorológica ou dependência adicional é necessária.

`tests/weather-icons.test.cjs` verifica mapeamento, variantes, arquivos, gradientes locais, orçamento e precache. `python scripts/verify-weather-icons.py` pinta as condições em 32/72px e os indicadores em 24/48px sobre fundos claro/escuro, verifica carregamento, proporções e margens transparentes e grava uma prancha para inspeção. `PLUVIA_BROWSER=webkit` seleciona WebKit. A CI roda essa prancha nos dois browsers e novamente no domínio público; `check-release.cjs` confere os hashes das 22 condições e dos 16 indicadores publicados. `verify-alignment.py` verifica visibilidade, tamanho e alinhamento de ícones, labels e valores na faixa de temperaturas. O QA geral verifica os consumidores na interface; isso não equivale a testar hardware iOS físico.

## Ícones em traço nos blocos de leitura (outubro/2026)

Pedido do usuário: os ícones de sensação, máxima, mínima, visibilidade, umidade, vento, pressão, UV e qualidade do ar devem seguir o estilo do relógio de “Previsão por hora”. Esses nove spans recebem `data-weather-icon-style="line"`; `hydrate` injeta um SVG inline de `LINE_METRICS` (grade 24px, sem cor própria, `aria-hidden` e `focusable=false`), e `continuous.css` aplica `--graphic-blue`, traço 2 e pontas arredondadas, como os ícones de seção. Sem nova requisição: os glifos ficam no módulo já carregado. Os SVGs coloridos de `metrics` continuam no catálogo para os outros consumidores (probabilidade de chuva nas listas e no detalhe). `verify-alignment.py` mede os ícones em traço do resumo.
