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

O motor determinístico continua sendo o comportamento imediato e nunca bloqueia a Home. Para usuários autenticados, a Edge Function `smart-summary` pode executar uma segunda interpretação generativa sobre o mesmo contexto. A resposta só substitui o fallback quando passa por validação de schema, evidências, números e hash do contexto atual.

O backend usa cache SHA-256 por contexto durante 20 minutos e cota atômica por usuário. As tabelas `smart_summary_cache` e `smart_summary_quota` têm RLS e não são acessíveis pelo cliente. A chamada ao provedor tem timeout de 8 segundos; qualquer falha preserva silenciosamente o resumo por regras.

Para ativar esse passe, configure `OPENAI_API_KEY` apenas nos secrets das Edge Functions. O padrão é `gpt-4o-mini`, compatível com Structured Outputs; `OPENAI_MODEL` permite substituí-lo sem novo deploy. Sem a chave, a função responde `provider_not_configured`; nenhum segredo ou endpoint do provedor aparece no bundle público.

## WeatherIcons

Os SVGs em `dist/vendor/weathericons/` vêm do projeto [kickstandapps/WeatherIcons](https://github.com/kickstandapps/WeatherIcons) e permanecem sob SIL Open Font License 1.1. A cópia da licença acompanha os assets.

`dist/modules/weather-icons.js` é a única camada de mapeamento:

`código WMO → condição normalizada → dia/noite → SVG local`

Dia/noite na previsão horária usa o nascer e o pôr do sol retornados pela fonte meteorológica para a data da cidade. A condição diária usa a variante diurna. Os SVGs usados pela Home, previsão horária e diária entram no precache do Service Worker.

Os favoritos atuais são identificadores no seletor de cidades, não cards meteorológicos com condição própria. O mapa representa camadas contínuas (modelo de precipitação, satélite e nuvens), portanto não recebe ícones pontuais que poderiam sugerir uma observação inexistente. Se essas superfícies passarem a carregar códigos WMO por cidade ou ponto, devem consumir o mesmo módulo central.

## Layout da Home

O contrato responsivo final fica no fim de `styles.css`, depois das regras legadas, para evitar nova inversão de cascata. Até 820 px, condições atuais e Resumo Inteligente usam uma única coluna. Todos os filhos principais recebem `min-width: 0` e largura limitada ao container. O gráfico horário mantém `overflow-x: auto` internamente e não usa a margem negativa antiga em mobile.
