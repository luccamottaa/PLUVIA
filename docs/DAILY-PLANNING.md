# Planejamento diário e observações — outubro de 2026

Status: **Planejar ao ar livre foi aposentado em outubro/2026 a pedido do dono** (módulo `outdoor-planner.js` e seus testes removidos do repositório). Astronomia, detalhe horário e preferências de notificação continuam ativos; `verify-daily-planning.py` valida esses consumidores.

## Inventário e decisões

Já existiam previsão horária completa (incluindo sensação, chuva, vento, rajadas e UV), card solar/fase lunar, METAR de SBEG, preferências Push com campos de silêncio/severidade no banco e login Google/Apple no frontend. Esta etapa reutiliza essas fontes e a infraestrutura estática; não adiciona biblioteca, tabela, API meteorológica ou cliente Auth.

- Notificações: controles para mínimo de severidade e silêncio, usando os campos existentes. Salvar/ativar não apaga restrições anteriores nem muda o fuso silenciosamente ao adicionar outra cidade. Leituras concorrentes são protegidas por revisão, inclusive A → B → A. Validação de formulário permanece dentro do tratamento de erro e libera a interface.
- Astronomia: `sky.astronomyAt` oferece amanhecer/crepúsculo civil e eventos lunares. Reutiliza a efeméride local já carregada, com caches de três dias. O vendor apenas expõe `getMoonTimes`, função que já existia. Não há segundo cálculo de posição, disco, fonte ou timer.
- Social: providers confirmados independentemente e documentação Apple corrigida conforme a documentação oficial atual. Google/Apple continuam desativados no servidor (settings público HTTP 200 em 03/10); ativação requer credenciais do proprietário em ambiente seguro. Ver `SOCIAL-AUTH.md`.

## Calendário astronômico

Nascer/pôr do Sol continuam usando `sky.dayAt`, compartilhado com céu/timeline. Amanhecer e fim do crepúsculo civil vêm do Sol a −6°, calculados por coordenadas na mesma fonte. As transições artísticas do fundo continuam graduais; não substituímos a identidade visual por uma visualização científica.

`getMoonTimes` varre um dia UTC. A atmosfera reúne os dias UTC que intersectam o dia civil municipal e filtra eventos pelo intervalo local `[meia-noite, próxima meia-noite)`, inclusive dias de 23/25 horas. Não usa timezone do dispositivo. Ausência de nascer/pôr nesse dia é legítima e difere de falha da efeméride. Horários são aproximados e não representam o horizonte real do usuário. Iluminação usa a fração da mesma leitura astronômica, em vez de recalcular o percentual a partir da fase.

## Silêncio e severidade

O mínimo vale para tipos selecionados, inclusive INMET; resumo diário segue sua seleção própria. O backend existente já filtra severidade e janela silenciosa, sem necessidade de redeploy ou migration. O silêncio inclui o início e exclui o fim, podendo cruzar meia-noite. É interpretado no fuso escolhido, válido para todas as cidades monitoradas. Severidade 4 pode interrompê-lo. O resumo ocorre no horário local de cada cidade e é suprimido se coincidir com o silêncio. Não há fila de entrega desses avisos após o fim do silêncio. Cooldown de seis horas permanece.

## Validação e limites

Testes unitários cobrem eventos lunares, DST, cache/troca de cidade, iluminação e preservação/revisão de preferências. `verify-daily-planning.py` exercita a UI real/SDK local com fixtures, incluindo salvar/limpar silêncio, severidade, quatro viewports, dados salvos/tempestade e troca de cidade com timezone do aparelho em Tóquio.

Auth, Push e clima são interceptados nos testes de browser. Nenhum teste envia Web Push real ou modifica contas de produção. Testes com fixtures não comprovam OAuth habilitado, meteorologia real ou iPhone físico. Resultados finais desta release são registrados no PR; o projeto publica `dist/`, sem build/lint frontend configurado.

## Próxima evolução fundamentada

Fortalecer tratamento de avisos futuros/áreas incertas e amostras opcionais. Ativar OAuth seguro com o proprietário e testar consentimento/retorno em Safari/PWA.
