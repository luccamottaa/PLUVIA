# Chuva iminente: decisão de dados

Revisão em 01/10/2026. Não ativamos uma previsão de minutos nesta etapa.

## Fontes atuais

- Open-Meteo fornece previsão horária utilizada por `hourly-outlook`. A documentação de [15-minutely](https://open-meteo.com/en/docs) afirma: “Only available in Central Europe and North America. Other regions use interpolated hourly data.” Para o Brasil, pedir `minutely_15` não cria resolução meteorológica nova. Não usar esse array para “começa em 15 minutos”.
- MET Norway complementa a previsão por hora. Os intervalos não sustentam minuto exato de início.
- RainViewer é radar observado, com cobertura dependente dos radares disponíveis. Frames observados não comprovam deslocamento, crescimento ou chuva futura em um ponto. Não extrapolar automaticamente pixels como ETA.
- A integração Xweather atual consulta raios observados. Eventos de raios não são previsão minutely de chuva. Seu teto de 150 consultas/mês permanece reservado a esse serviço.

## Candidato documentado, ainda sem validação regional

[Xweather Conditions](https://www.xweather.com/docs/weather-api/endpoints/conditions) documenta `filter=minutelyprecip`, horizonte de até 60 minutos e cobertura global, com maior resolução em regiões selecionadas. A fonte é uma mistura interpolada/modelada de observações, radar/satélite e modelos. “Global” não demonstra que a precisão de início em Manaus seja equivalente à de regiões com radar denso.

URL de avaliação, **não executada**:
`https://data.api.xweather.com/conditions/-3.119,-60.022?filter=minutelyprecip&client_id={client_id}&client_secret={client_secret}`

Custo-base do endpoint: **×1 acesso**. A documentação informa cobrança por hora para minutely; um único horizonte de 60 minutos tem estimativa de 1 acesso, a confirmar no `X-Cost-Tokens` da consulta e contrato. Nenhuma chave é colocada no frontend e não foi gasto acesso para avaliar esse candidato.

## Critérios antes de ativar

1. Confirmar no plano permissão para minutely, licença de exibição e limite/custo real; orçamento separado de raios.
2. Confirmar unidade, intervalo, timestamps, freshness e identificação de amostras ausentes no payload real.
3. Validar eventos de chuva em cidades brasileiras com diferentes coberturas, comparando com observações independentes; registrar erro de início/fim e falsos negativos. Um payload de amostras por minuto não comprova precisão de um minuto.
4. Preservar fallback horário e apresentar estimativa em faixa (“entre … e …”) apenas quando dados e validação sustentarem isso. Fonte, atualização e cobertura devem acompanhar o resultado.
5. Implementar cache por área, deduplicação, timeout, orçamento atômico e atualização centralizada; sem polling em cada card/favorito.

A experiência atual “Quando pode chover?” continua utilizando intervalos horários honestos. Esta avaliação evita adicionar consultas interpoladas sem benefício demonstrado.

## Evolução observacional em 03/10/2026

O novo [PLUVIA Nowcast](NOWCAST.md) mantém esta decisão sobre previsões interpoladas. Integra METAR observado do SBEG e prepara um motor quantitativo, sem usar PoP como radar. SIPAM ainda depende de autorização/feed validado; estimativa de minutos permanece somente no harness de desenvolvimento/testes. O orçamento Xweather não foi consumido nem reaproveitado para um novo endpoint.
