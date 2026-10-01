# Analytics e privacidade

O Pluvia usa o projeto PostHog 602240 (US Cloud). O antigo arquivo Amplitude continha uma chave placeholder e não enviava eventos; esta etapa substitui essa preparação inativa. O token `phc_` publicado é exclusivamente o token público de ingestão, não uma chave pessoal/administrativa.

A participação começa desligada e pode ser alterada em **Privacidade** no rodapé. `Do Not Track` e `Global Privacy Control` impedem a coleta mesmo com preferência anterior ativada. A preferência é local, sincronizada entre abas pelo evento storage; dados meteorológicos e conta funcionam independentemente dela.

## Contrato de coleta

`dist/analytics.js` preserva `track`, `identify` e `resetUser` para os consumidores existentes. `identify` é intencionalmente uma operação vazia: o UUID de Auth nunca entra no PostHog. Cada carregamento usa um identificador aleatório criptográfico apenas em memória; não há cookie, ID persistente ou perfil pessoal. Reset de conta descarta fila e ID. Não interpretar aberturas como pessoas únicas ou retenção.

Eventos permitidos: abertura, pesquisa, seleção/favorito, visualização do mapa, abertura de aviso/link oficial, localização, modos/resultados de conta e preferências/resultados push. Pesquisa envia somente comprimento. A allowlist de propriedades aceita enums técnicos, boolean standalone e números limitados de comprimento/status HTTP; descarta cidade, UF, GPS, nomes, e-mail, texto digitado, conteúdo DOM, URLs, tokens, mensagens e stack traces.

`App Failure` informa componente e código fixos: timeout, rede, resposta inválida, indisponibilidade/rate limit e falhas da aplicação/assets. Cancelamentos são excluídos. O cliente HTTP reporta somente fontes conhecidas e preserva a exceção original mesmo se a instrumentação falhar. Não há SDK, autocapture, replay ou captura de tela; classificação do navegador usa somente uma família, sem enviar o user-agent bruto.

POST `/batch/?ip=0` usa `credentials:omit`, `referrerPolicy:no-referrer`, `$ip:null`, `$geoip_disable:true` e `$process_person_profile:false`. Isso pede descarte do IP nos eventos e desativa GeoIP/perfil. O servidor ainda recebe o IP da conexão de transporte; não alegar ausência de IP em todos os logs operacionais do provedor. A configuração de descarte global do projeto deve ser revisada antes de ampliar coleta. Nunca usar localização de métricas como dado meteorológico.

Fila somente em memória: até 50 eventos pendentes, lote 20, até 100 eventos aceitos por visita, dez padrões distintos de falha. Envio em dois segundos, timeout cinco segundos, uma consulta simultânea, sem retry em loop. Offline conserva somente a fila limitada e tenta ao reconectar. Revogar interrompe requests pendentes e descarta fila; não apaga eventos já aceitos no servidor. Falha/bloqueador de analytics nunca impede previsão ou conta.

## Painel e verificação

[Painel PLUVIA — Uso e confiabilidade](https://us.posthog.com/project/602240/dashboard/2158406): aberturas, pesquisa/cidades/mapa e falhas. São contagens operacionais de participantes, não métricas canônicas aprovadas do Data Catalog nem amostra de todos os usuários. Filtro `app=PLUVIA` e `environment=production`; gráficos inicialmente vazios, sem fabricar números.

Em 01/10/2026 foram enviados cinco eventos sintéticos `environment=validation`; a API aceitou HTTP 200, a taxonomia reconheceu os cinco nomes e a consulta confirmou uma abertura sintética. Os três gráficos foram executados sem warnings e excluíram esses eventos. Nenhuma identidade real foi enviada. `pluvia-next-rain-map` permanece desativada e sem controle da interface; não há avaliação remota de flags neste módulo.

Testes cobrem opt-in, DNT/GPC, allowlist, identidade transitória, limites, offline, revogação antes/durante envio e entre abas, falhas e cancelamento. QA Chromium/WebKit verifica o controle de privacidade e os fluxos existentes com fixtures. Alterar referência versionada e geração do SW junto com qualquer atualização deste arquivo.

Referências: [API de ingestão](https://posthog.com/docs/api/capture), [eventos anônimos](https://posthog.com/docs/data/anonymous-vs-identified-events), [controles de coleta](https://posthog.com/docs/privacy/data-collection).
