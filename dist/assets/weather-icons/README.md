# Sistema de ícones meteorológicos PLUVIA

Os PNGs desta pasta formam a primeira versão do conjunto glossy/3D próprio do PLUVIA. A aplicação resolve todos os ícones por `modules/weather-icon-system.js`; componentes não devem importar assets individualmente.

## Disponíveis

- Condições: céu limpo, parcialmente nublado, nublado, encoberto, neblina, névoa, chuva fraca/moderada/forte, pancadas, tempestade, tempestade com chuva/granizo e neve.
- Métricas: temperatura, sensação, máxima/mínima, umidade, ponto de orvalho, pressão, visibilidade, vento/rajada/direção, nuvens, UV, qualidade do ar, probabilidade e volume de chuva.

## Pendentes

Ainda não existem assets glossy distintos para `few-clouds-*`, garoa congelante, granizo isolado, fumaça, poeira, areia, vento com/sem nuvens, tempestade tropical, ciclone, astronomia, mapas, alertas, status e fallbacks dedicados.

Esses nomes continuam tipados e usam temporariamente o conjunto WeatherIcons local, licenciado em `vendor/weathericons/LICENSE.txt`. Nenhum arquivo foi duplicado ou renomeado para fingir cobertura. Quando um novo asset for criado, ele deve ser adicionado ao manifesto central antes de entrar na interface.

## Fonte dos dados

O adaptador atual recebe códigos WMO do Open-Meteo, converte para uma condição interna do PLUVIA e só então escolhe o ícone. Dia/noite usa timestamp, nascer e pôr do sol do local consultado. Condições que a fonte não informa não são inferidas.
