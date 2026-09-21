# Contexto meteorológico inteligente

O módulo `dist/modules/weather-insights.js` transforma os dados já recebidos do Open-Meteo em contexto curto e verificável. Ele não cria previsão e não chama IA.

## Comparação com ontem

A consulta inclui `past_hours=24`. A comparação usa o ponto horário equivalente do mesmo modelo, na mesma localização e no mesmo horário local. O texto deixa explícito que é uma referência de modelo, não uma observação de estação.

## Sensação térmica

A explicação considera a diferença entre temperatura e sensação, umidade e vento. Quando faltam campos necessários, o detalhe é omitido.

## UV

O pico é calculado somente entre a hora atual e o fim do dia local. Níveis abaixo de moderado não ganham destaque indevido.

## Chuva

A leitura das próximas 12 horas combina probabilidade máxima, volume acumulado, pico horário e janela relevante. O agregado exige 12 amostras com probabilidade entre 0 e 100 e precipitação não negativa. Uma lacuna, tipo inválido ou horizonte menor que 12 horas omite essa leitura e suas recomendações; zero numérico continua válido. Probabilidades de 35% a 59% são descritas como possibilidade de chuva, sem a frase de baixa chance. O sistema não estima chegada em minutos e não chama previsão de radar.

## Falha e cache

O módulo é opcional: qualquer erro é isolado da previsão principal. Os dados continuam usando o cache meteorológico existente; não há chamada externa adicional além do histórico de 24 horas incorporado à consulta principal.

## Correção de ausência de dados — core-63

A normalização preserva ausência como `null`: strings, booleanos, arrays, objetos e valores não finitos não são medições numéricas. `is_day` aceita somente 0 ou 1. Testes de regressão cobrem clima, AQI, séries e contexto de chuva. APIs e identidade visual não mudaram. Componentes legados que ainda consomem payload bruto precisam de revisão adicional; esta correção não conclui a Fase 1.

Rollback: reverter o commit desta correção, mantendo os módulos e referências do shell sincronizados, e publicar uma nova versão de cache do service worker.

O Resumo Inteligente e os destaques contextuais compartilham o mesmo card. Antes da exibição, rótulos equivalentes são deduplicados sem alterar a prioridade nem os dados de origem.
