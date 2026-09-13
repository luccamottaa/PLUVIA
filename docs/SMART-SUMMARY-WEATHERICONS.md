# Resumo Inteligente e WeatherIcons

## Resumo Inteligente

O card da Home recebe somente o contexto meteorológico já carregado para a cidade. A sequência implementada é:

1. `smart-summary.js` normaliza condição atual, próximas 3/6 horas, UV e AQI;
2. o motor determinístico seleciona o evento mais relevante;
3. cada frase e destaque declara as chaves de evidência utilizadas;
4. `validate()` rejeita estado, tamanho, evidência ou hash incompatível;
5. o resultado validado é salvo por cidade por até 45 minutos;
6. um alerta laranja ou vermelho do INMET substitui a leitura normal enquanto estiver vigente.

O hash inclui cidade, hora meteorológica, condição, sensação, umidade, precipitação, rajadas, UV e AQI. Uma alteração relevante invalida o cache antes do TTL.

Não há provedor generativo ativo. Nenhuma chave de IA está configurada no backend do projeto e a Home pública não expõe um endpoint anônimo pago. O motor determinístico é o comportamento de produção e não bloqueia a interface. Uma etapa generativa futura deve executar somente no backend, devolver JSON estruturado, manter as evidências e passar pela mesma validação antes de substituir o fallback.

## WeatherIcons

Os SVGs em `dist/vendor/weathericons/` vêm do projeto [kickstandapps/WeatherIcons](https://github.com/kickstandapps/WeatherIcons) e permanecem sob SIL Open Font License 1.1. A cópia da licença acompanha os assets.

`dist/modules/weather-icons.js` é a única camada de mapeamento:

`código WMO → condição normalizada → dia/noite → SVG local`

Dia/noite na previsão horária usa o nascer e o pôr do sol retornados pela fonte meteorológica para a data da cidade. A condição diária usa a variante diurna. Os SVGs usados pela Home, previsão horária e diária entram no precache do Service Worker.

## Layout da Home

O contrato responsivo final fica no fim de `styles.css`, depois das regras legadas, para evitar nova inversão de cascata. Até 820 px, condições atuais e Resumo Inteligente usam uma única coluna. Todos os filhos principais recebem `min-width: 0` e largura limitada ao container. O gráfico horário mantém `overflow-x: auto` internamente e não usa a margem negativa antiga em mobile.
