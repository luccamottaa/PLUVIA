# Comparar cidades

## O que é

- Em "Suas cidades" (lupa), o botão **Comparar cidades** abre um diálogo com a cidade aberta ao lado de outra.
- A outra cidade vem de uma lista com, nesta ordem:
  - **Meus locais**, com o nome pessoal (ex.: "Faculdade · Belém/PA");
  - **Favoritos**;
  - **Capitais**.
- A lista não repete cidade e não inclui a cidade aberta. Sem favoritos nem locais, as capitais garantem uma escolha.
- Linhas comparadas:
  - **Agora:** temperatura e condição;
  - **Sensação;**
  - **Máx./mín. hoje,** no dia municipal de cada cidade;
  - **Chuva em 12h:** a mesma frase do "Vai chover?" da Home e o volume somado;
  - **Qualidade do ar:** US AQI com a mesma classificação da Home.

## Dados e regras

- **Cidade aberta:** reaproveita a previsão já exibida (`displayedWeather`), sem request novo. Se a leitura for salva, o cabeçalho mostra "leitura salva".
- **Outra cidade:**
  - É consultada só ao abrir o diálogo ou trocar a escolha. A abertura da Home não faz nenhuma consulta de comparação.
  - Faz uma consulta curta do Open-Meteo (`weather.getCompare`: leitura atual, chuva horária, máx./mín.) e a qualidade do ar CAMS atual.
  - Usa cliente HTTP próprio, cache em memória de 20 min (até 12 cidades) e revisão para descartar respostas atrasadas.
  - Fechar o diálogo ou trocar de cidade cancela a consulta.
- **Mesmo resumo para as duas colunas:** `PLUVIA.compare.summarize`, com `city-time` (hora e dia municipais) e `weatherInsights.rainAnswer`.
  - A chuva usa o intervalo que termina em `i+1`, como no resto do app.
  - Valores ausentes ficam "—" ou "Indisponível", nunca zero.
  - O volume só aparece com a série completa das horas cobertas.
- **Falhas:**
  - Previsão indisponível: a coluna mostra "Indisponível" e uma mensagem diz o que falhou (sem internet ou consulta falhou).
  - Ar indisponível: só a linha do ar fica sem dado.
- **Meus locais:** `saved-places.js` expõe `PLUVIA.savedPlaces.list()`, só leitura, e a sincronização continua com ele.

## Acessibilidade e layout

- **Tabela nativa:** cabeçalhos de coluna (cidades) e de linha (leituras), mais um `caption` para leitores de tela.
- **Até 380 px:** o rótulo ocupa a linha e as duas cidades ficam lado a lado embaixo. Os papéis ARIA explícitos mantêm a semântica de tabela com `display:grid`.
- **Diálogo:** o mesmo dos outros (motion, Escape, backdrop, `dialog-scroll`). O foco inicial vai no botão fechar.

## Testes

- `tests/compare-cities.test.cjs`:
  - resumo, alinhamento da chuva e série incompleta;
  - ausentes e dia municipal;
  - montagem das opções sem repetição.
- `scripts/verify-compare.py`:
  - 320, 390 e 1366 px;
  - nenhuma consulta na abertura;
  - grupos da lista, linhas lado a lado sem estouro e papéis ARIA;
  - falha da previsão e do ar;
  - Escape.
  - Roda no Chromium e no WebKit da CI.

## Limites

- Compara só duas cidades. Não há gráfico horário lado a lado: a comparação é um resumo rápido, e o detalhe continua abrindo a cidade.
- Avisos INMET não entram na tabela; eles já aparecem nos cards de favoritos.
- Fixtures não comprovam disponibilidade real das APIs.
