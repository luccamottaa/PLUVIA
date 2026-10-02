# Evolução da leitura por hora

## O que já existe

O painel já oferece timeline com detalhes por toque, temperatura, sensação, chuva/probabilidade, vento/rajadas/direção e eventos solares. UV, pressão, qualidade do ar, Lua, favoritos compactos, compartilhamento, cache offline e radar animado também têm implementações próprias. Esta etapa melhora o gráfico existente, sem criar outra timeline ou novos requests.

## Correções e evolução desta etapa

- A barra de chuva anteriormente usava probabilidade para definir altura quando o volume era zero ou ausente. Agora só volumes positivos desenham barras, em escala linear compartilhada. Zero continua explícito em mm; ausência fica indisponível. Chance é um label separado, mesmo sem barra.
- O gráfico e o resumo de cinco horas reutilizam `hourlyDetail.detail` para validação e alinhamento da precipitação ao intervalo seguinte. Lacunas, strings e números fora das faixas não viram leituras válidas.
- O modo Sensação mostra a série aparente, com temperatura de referência abaixo. Ausência de série tem mensagem própria, sem estimativa fabricada.
- A legenda explica o significado de cada modo e o horário municipal. Tabs continuam nativas, com estado `aria-pressed`, toque e quebra de linha em telas estreitas.
- Não há biblioteca, API, timer ou dependência adicional. O SW e os assets recebem versões coordenadas.

## Pendências externas e limites reais

O usuário informou ter configurado os e-mails. Esta etapa não envia e-mail real nem certifica entrega na caixa postal. O fluxo continua coberto por fixtures de cadastro/recuperação; confirmação real deve usar uma caixa controlada.

Os settings públicos do Supabase ainda indicaram Google e Apple desativados na inspeção desta etapa. Frontend, descoberta de providers e retorno OAuth já existem. Ativação requer cliente Google Cloud e configuração Apple Developer, guardando secrets exclusivamente no provedor. Instruções e URLs em `SOCIAL-AUTH.md`. Não adicionar outro SDK/login nem exibir botão que não funciona.

Web Push já tem teste voluntário e registro de abertura por `push_delivery`; aceitação pelo serviço não prova entrega. A validação física em iPhone/PWA/background continua necessária. Nenhum teste foi enviado a usuários nesta etapa. WebKit automatizado não equivale a iPhone real.

Nowcast brasileiro com início em minutos continua sem fonte validada. Open-Meteo horário, MET e radar observado não justificam promessas de 15 minutos. A avaliação e critérios de Xweather minutelyprecip estão em `NOWCAST-EVALUATION.md`; o orçamento de raios não foi usado para avaliar outra API.

## Validação

Novas regressões verificam volume zero/ausente com chance alta, escala proporcional, dados inválidos, lacunas, meia-noite e sensação sem série. A verificação de navegador exercita os quatro modos e ausência de overflow nas sete dimensões existentes, em Chromium e WebKit. Resultados da execução são reportados junto da publicação; não há lint, compilador frontend ou build npm configurado neste projeto estático.
