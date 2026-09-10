# Analytics e privacidade

A instrumentação do PLUVIA fica em `dist/analytics.js` e só envia eventos quando uma chave pública válida do Amplitude for configurada. Sem chave, o módulo não baixa o SDK, não cria fila útil e não envia nada.

## Eventos preparados

- `PLUVIA Opened`
- `Location Requested`, `Location Authorized`, `Location Denied`, `Location Unavailable`
- `City Search Opened`, `City Searched`, `City Selected`, `Favorite City Toggled`
- `Rain Map Opened`, `Rain Animation Toggled`
- `Alert Opened`, `Official Alert Link Opened`
- `Account Dialog Opened`, `Auth Mode Selected`, `Auth Started`, `Auth Completed`, `Signup Confirmation Requested`, `Profile Name Saved`

O filtro descarta propriedades cujo nome indique e-mail, senha, token, latitude, longitude ou coordenadas. Textos são limitados a 80 caracteres. A localização enviada é apenas município e UF; a consulta digitada na busca não é enviada, somente o comprimento.

O identificador de usuário, quando o Amplitude estiver ativo, é o UUID opaco do Supabase. E-mail e nome não são enviados.

## Estado atual

O projeto Amplitude encontrado chama-se `default`, mas a chave pública ainda não está configurada no site. Portanto, não há dados suficientes para análises de retenção ou funil. A ativação e a verificação da ingestão estão no Linear como LUC-5.

O PostHog contém a flag `pluvia-next-rain-map`. Ela permanece ativa no serviço, mas não controla nenhuma experiência no frontend atual porque o novo mapa ainda não foi implementado.
