# PLUVIA no ChatGPT — arquitetura MCP

## Objetivo

Transformar o PLUVIA em um serviço meteorológico reutilizável pelo site e, futuramente, por uma experiência do PLUVIA no ChatGPT, sem reconstruir o frontend atual nem expor segredos no navegador.

## Princípios

- O site atual continua funcionando durante a migração.
- A lógica meteorológica deve ser extraída de forma incremental do frontend para serviços reutilizáveis.
- Nunca apresentar modelo como observação.
- Alertas oficiais preservam fonte, severidade, vigência e abrangência.
- Toda resposta meteorológica deve carregar fonte e horário do dado quando disponíveis.
- Não prometer precisão de rua quando a fonte é municipal ou modelada.
- Segredos de APIs ficam exclusivamente no backend.
- O núcleo do PLUVIA Sinal deve permanecer determinístico, versionado e testável.

## Arquitetura-alvo

```text
Site PLUVIA ───────────────┐
                           │
ChatGPT / cliente MCP ─────┼──> PLUVIA Weather API
                           │        │
Futuro app mobile ─────────┘        ├── Open-Meteo
                                    ├── INMET
                                    ├── Open-Meteo / CAMS
                                    ├── RainViewer
                                    ├── NASA GIBS
                                    ├── Defesa Civil
                                    └── provedores futuros validados

PLUVIA MCP Server ─────────────> PLUVIA Weather API
```

O servidor MCP não deve duplicar a lógica meteorológica. Ele funciona como uma interface segura e estruturada sobre a API do PLUVIA.

## Fase 1 — contrato interno

Criar um contrato normalizado independente dos provedores:

```json
{
  "location": {
    "ibge_id": "1302603",
    "name": "Manaus",
    "uf": "AM",
    "timezone": "America/Manaus"
  },
  "observed_at": null,
  "generated_at": "ISO-8601",
  "freshness": "fresh|stale|partial",
  "sources": [],
  "data": {}
}
```

Reutilizar e evoluir `dist/modules/sources.js` e os adapters existentes em vez de criar uma segunda taxonomia de fontes.

## Fase 2 — PLUVIA Weather API

Começar somente com endpoints read-only:

- `GET /v1/weather/current?city_id=`
- `GET /v1/weather/hourly?city_id=`
- `GET /v1/weather/daily?city_id=`
- `GET /v1/rain?city_id=`
- `GET /v1/alerts?city_id=`
- `GET /v1/air-quality?city_id=`
- `GET /v1/signal?city_id=`
- `GET /v1/sources?city_id=`

Antes de aceitar latitude/longitude arbitrárias, manter o ID IBGE como identificador canônico sempre que possível. Geolocalização precisa deve ter política de privacidade própria e não deve aparecer em logs ou analytics.

## Fase 3 — PLUVIA Sinal

Extrair a regra atualmente espalhada pela interface para um módulo puro e testável.

Resposta sugerida:

```json
{
  "level": "green|yellow|orange|red|unknown",
  "label": "Pode sair",
  "summary": "Sem chuva relevante prevista no curto prazo.",
  "reasons": [],
  "confidence": "high|moderate|low",
  "valid_until": "ISO-8601",
  "sources": []
}
```

O sinal deve considerar apenas dados realmente disponíveis e nunca transformar ausência de informação em condição segura.

## Fase 4 — servidor MCP

Expor inicialmente ferramentas somente de leitura:

### `get_current_weather`
Argumentos: `city`, `uf` ou `ibge_id`.
Retorna condição atual, sensação, umidade, vento, chuva e fonte.

### `get_rain_forecast`
Argumentos: localização normalizada e horizonte.
Retorna precipitação prevista, probabilidade, janela seca e fonte.

### `get_official_alerts`
Argumentos: localização normalizada.
Retorna somente alertas oficiais confirmados para a área, com fonte e vigência.

### `get_air_quality`
Argumentos: localização normalizada.
Retorna AQI e poluentes disponíveis, deixando explícito quando são estimativas modeladas.

### `get_pluvia_signal`
Argumentos: localização normalizada.
Retorna o PLUVIA Sinal, fatores, confiança, validade e fontes utilizadas.

### `get_source_status`
Argumentos: localização normalizada.
Retorna saúde, atualização e natureza de cada fonte: oficial, observação ou estimativa.

Não incluir ferramentas de escrita, conta ou notificações na primeira versão.

## Fase 5 — segurança e operação

- HTTPS obrigatório.
- Chaves de provedores somente em secrets do backend.
- Rate limiting por cliente/IP quando aplicável.
- Timeouts e retries com backoff.
- Circuit breaker para provedores instáveis.
- Cache com TTL específico por fonte.
- Nunca cachear além do permitido pelos termos de cada provedor.
- Logs sem e-mail, senha, token ou coordenadas precisas desnecessárias.
- IDs de correlação para diagnosticar chamadas sem registrar dados sensíveis.
- Health endpoint interno e monitoramento de latência/erro por provedor.

## Fase 6 — hospedagem

Avaliar primeiro a infraestrutura já conectada ao projeto:

1. Supabase Edge Functions para endpoints pequenos e próximos do Auth/banco.
2. Railway se o MCP precisar de processo Node persistente, observabilidade própria, filas ou maior liberdade operacional.

Não introduzir os dois para a mesma função sem necessidade.

## Fase 7 — experiência no ChatGPT

Exemplos de intenções que o servidor deverá responder bem:

- “@PLUVIA vai chover em Manaus hoje?”
- “@PLUVIA dá pra sair agora?”
- “@PLUVIA tem alerta oficial para Manaus?”
- “@PLUVIA quando aparece a próxima janela sem chuva?”
- “@PLUVIA como está a qualidade do ar?”

O MCP deve devolver dados estruturados e curtos. A camada conversacional é responsável por explicá-los ao usuário sem inventar informação ausente.

## Fase 8 — integração do site

Somente depois de a API estar validada, migrar gradualmente o site para consumi-la. Ordem sugerida:

1. fontes/status;
2. alertas;
3. PLUVIA Sinal;
4. qualidade do ar;
5. previsão;
6. mapas e camadas especiais.

Cada migração precisa manter fallback e testes existentes.

## Testes mínimos

- normalização por município/IBGE;
- timezone;
- unidades;
- fonte stale/indisponível;
- alertas fora da vigência;
- alerta que não inclui o município;
- API parcialmente indisponível;
- PLUVIA Sinal sem dados suficientes;
- cache e TTL;
- schema das respostas MCP;
- ausência de segredos/PII em logs e respostas.

## Critério para primeira versão pública

A primeira versão do MCP só deve ser publicada quando as seis ferramentas read-only retornarem schemas estáveis, tiverem testes automatizados e mantiverem a distinção entre dado oficial, observação e estimativa. O site atual não deve depender do MCP para continuar funcionando.
