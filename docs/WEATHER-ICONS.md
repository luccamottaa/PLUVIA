# Ícones meteorológicos do PLUVIA

A família de condições usa 22 SVGs originais, estáticos e transparentes. As nuvens têm volume por gradientes; Sol dourado, Lua prateada, gotas azuis e raios distinguem as condições sem depender apenas da cor. Não são imagens de observações meteorológicas nem a fase lunar real.

`dist/modules/weather-icon-system.js` continua responsável por código WMO, variantes dia/noite, nomes, labels e markup acessível. Previsão horária, diária e seus detalhes reutilizam o mesmo catálogo. A troca de arte não altera modelos, dados, horários ou regras meteorológicas. Instrumentos, mapa e efemérides mantêm seus símbolos existentes.

- WMO 1 usa uma nuvem menor que WMO 2, com variantes diurna/noturna.
- Céu encoberto tem duas camadas de nuvens; chuva forte tem nuvem mais escura e mais gotas que chuva fraca/moderada. Garoa tem gotas menores.
- Trovoadas (95) usam raio sem acrescentar chuva; granizo tem partículas próprias. Probabilidade não escolhe intensidade.
- A Lua dos ícones é um símbolo noturno. O disco e a fase astronômica do fundo continuam em `moon-view.js`/`sky-atmosphere.js`.

Regenerar com `node scripts/generate-modern-weather-icons.cjs`. O gerador conserva o catálogo e inclui apenas os gradientes utilizados por cada condição. Não editar SVGs gerados isoladamente, adicionar filtros/blur/animação, fontes externas ou imagens raster. O limite é 4 KiB por condição e 50 KiB para os 22 arquivos, sem os assets legados que continuam disponíveis para shells antigos.

Versões dos assets, módulo, referência HTML e precache precisam avançar juntas com a geração do SW. Símbolos auxiliares que não mudaram conservam os mesmos bytes. Nenhuma consulta meteorológica ou dependência adicional é necessária.

`tests/weather-icons.test.cjs` verifica mapeamento, variantes, arquivos, gradientes locais, orçamento e precache. `python scripts/verify-weather-icons.py` pinta o catálogo real em 32/72px sobre fundos claro/escuro, verifica carregamento, proporções e margens transparentes e grava uma prancha para inspeção. `PLUVIA_BROWSER=webkit` seleciona WebKit. A CI roda essa prancha nos dois browsers e novamente no domínio público; `check-release.cjs` confere também os hashes dos 22 SVGs publicados. O QA geral verifica os consumidores na interface; isso não equivale a testar hardware iOS físico.
