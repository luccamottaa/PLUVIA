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
   - Leitura salva há menos de 10 min (`recentlySaved`) aparece como atual enquanto atualiza.
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
- **Supabase SDK** (213 KB) continua carregando para a conta. Adiar o SDK muda o fluxo de Auth e precisa de passo próprio.
