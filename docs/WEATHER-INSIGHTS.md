# Contexto meteorológico inteligente

O módulo `dist/modules/weather-insights.js` transforma os dados já recebidos do Open-Meteo em contexto curto e verificável. Ele não cria previsão e não chama IA.

## Comparação com ontem

A consulta inclui `past_hours=24`. A comparação usa o ponto horário equivalente do mesmo modelo, na mesma localização e no mesmo horário local. O texto deixa explícito que é uma referência de modelo, não uma observação de estação.

## Sensação térmica

A explicação considera a diferença entre temperatura e sensação, umidade e vento. Quando faltam campos necessários, o detalhe é omitido.

## UV

O pico é calculado somente entre a hora atual e o fim do dia local. Níveis abaixo de moderado não ganham destaque indevido.

## Chuva

A leitura das próximas 12 horas combina probabilidade máxima, volume acumulado, pico horário e janela relevante. O sistema não estima chegada em minutos e não chama previsão de radar.

## Falha e cache

O módulo é opcional: qualquer erro é isolado da previsão principal. Os dados continuam usando o cache meteorológico existente; não há chamada externa adicional além do histórico de 24 horas incorporado à consulta principal.
