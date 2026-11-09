# PLUVIA · protótipo React

Protótipo de referência do painel em React 19 + TypeScript estrito + Tailwind 4 + Framer Motion.
**Não é o app publicado** (o app é estático, em `dist/`, sem React) e não entra no deploy.
Serve para portar o desenho para outra base e testar ideias sem mexer no painel público.
O sistema visual está em `docs/DESIGN-SYSTEM.md`.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest: adaptador Open-Meteo e frase de chuva
npm run build      # typecheck + build em ./dist (ignorado pelo git)
```

## Estrutura

| Caminho | Papel |
| --- | --- |
| `src/types.ts` | Contrato normalizado (`Forecast`, `HourReading`…). Componentes nunca leem o JSON cru. |
| `src/lib/open-meteo.ts` | Consulta com prazo e cancelamento, erros tipados, adaptador (fuso da cidade, chuva `i+1`, ausência = `null`) e busca de cidades. |
| `src/lib/insights.ts` | Frase "Leve um guarda-chuva" pela regra do "Vai chover?", rótulos de UV/umidade/vento. |
| `src/hooks/useWeather.ts` | Uma consulta por cidade; troca cancela a anterior e resposta atrasada não pinta a cidade nova. |
| `src/hooks/useCitySearch.ts` | Autocomplete com debounce, cache curto e cancelamento. |
| `src/components/SearchBar.tsx` | Combobox acessível, recentes, localização só no toque, lista e indicador com mola. |
| `src/components/Hero.tsx` | Cidade, temperatura (algarismos no eixo, grau pendurado), condição e frase. |
| `src/components/MetricGrid.tsx` | Umidade, UV, vento, chance de chuva. Cada cartão troca a lente das horas. |
| `src/components/HourlyStrip.tsx` | 24 horas com bolha de vidro arrastável (mola) e `role="slider"`. |
| `src/components/DailyForecast.tsx` | 7 dias com escala comum e detalhe que abre pela altura. |
| `src/components/SkyBackdrop.tsx` | Céu fixo, chuva e raio em CSS (só transform/opacity, pausa com a página oculta). |

## Regras que o protótipo segue (as mesmas do app)

- Vidro com `backdrop-filter` só em controles pequenos (busca, seletor, frase). Cartões são translúcidos **sem** desfoque: blur por cartão sobre céu animado derrubou o Safari do iPhone.
- Hover (escala 1,02 + brilho azul pulsante) só em cartão clicável e só com mouse (`hover: hover` e `pointer: fine`).
- A bolha das horas não desfoca: por cima do texto, o desfoque deixaria a hora ilegível.
- `prefers-reduced-motion` desliga cascata, mola, chuva e raio; `prefers-reduced-transparency` troca vidro por fundo sólido.
- Localização nunca é pedida sozinha; a busca de cidades fica restrita ao Brasil (`countryCode=BR`).
