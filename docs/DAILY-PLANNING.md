# Planejamento diário e observações — outubro de 2026

## Inventário e decisões

Já existiam previsão horária completa (incluindo sensação, chuva, vento, rajadas e UV), card solar/fase lunar, METAR de SBEG, preferências Push com campos de silêncio/severidade no banco e login Google/Apple no frontend. Esta etapa reutiliza essas fontes e a infraestrutura estática; não adiciona biblioteca, tabela, API meteorológica ou cliente Auth.

- Novo `modules/outdoor-planner.js`: comparação determinística de faixas de duas horas, integrada abaixo da timeline, com abertura do detalhe horário existente.
- Observações Manaus: exposição dos campos de vento/rajadas já normalizados pelo provider METAR NOAA. Direção é **de onde vem** o vento; VRB/ausência não viram Norte. Rajada ausente não vira zero. O boletim representa o aeroporto e seu horário, sem generalizar para bairros.
- Notificações: controles para mínimo de severidade e silêncio, usando os campos existentes. Salvar/ativar não apaga restrições anteriores nem muda o fuso silenciosamente ao adicionar outra cidade. Leituras concorrentes são protegidas por revisão, inclusive A → B → A. Validação de formulário permanece dentro do tratamento de erro e libera a interface.
- Astronomia: `sky.astronomyAt` oferece amanhecer/crepúsculo civil e eventos lunares. Reutiliza a efeméride local já carregada, com caches de três dias. O vendor apenas expõe `getMoonTimes`, função que já existia. Não há segundo cálculo de posição, disco, fonte ou timer.
- Social: providers confirmados independentemente e documentação Apple corrigida conforme a documentação oficial atual. Google/Apple continuam desativados no servidor (settings público HTTP 200 em 03/10); ativação requer credenciais do proprietário em ambiente seguro. Ver `SOCIAL-AUTH.md`.

## Regras do planejamento

Horizonte: próximas 24 horas. Comparam-se janelas futuras de **duas horas reais contínuas**, inteiramente entre `sky.dayAt().rise/set` do município. Não se chama observação ou nowcast a uma recomendação baseada em modelo.

São necessárias sensação térmica, velocidade do vento e condição nos três pontos horários, além de volume/probabilidade nos dois intervalos. Chuva no intervalo que começa em `i` vem de `i+1`, por `hourlyDetail.detail`. Timestamps são interpretados por `city-time`; lacunas/offsets inconsistentes são recusados. Dados ausentes/string não viram zero. UV/rajadas incompletos são explicitamente identificados; extremos conhecidos nessas séries continuam vetando a janela.

Critérios heurísticos conservadores de comparação, não limites clínicos ou garantia de segurança: sensação 10–34 °C, chance menor que 60%, volume total menor que 1 mm, vento menor que 30 km/h, rajada conhecida menor que 50 km/h, UV conhecido menor que 8, condição WMO 0–3. Entre as janelas elegíveis, prioriza menor desvio de sensação em relação a 23 °C e penaliza chuva, vento, UV e lacunas opcionais. Empate escolhe a primeira faixa. Esses critérios precisam de revisão com uso real; não são personalizados para esforço físico, saúde ou exposição individual.

Previsão salva/offline, idade de consulta acima de 90 minutos ou aviso oficial vigente confirmado para o município suspendem a sugestão. A UI manda conferir avisos/proteção solar e informa que a previsão pode mudar; não promete tempo seguro nem ausência de chuva. A consulta aos avisos pode falhar e avisos futuros/áreas incertas devem ser conferidos na fonte oficial. O relógio/refresh existentes coordenam atualização; não há request ou polling próprio.

## Calendário astronômico

Nascer/pôr do Sol continuam usando `sky.dayAt`, compartilhado com céu/timeline. Amanhecer e fim do crepúsculo civil vêm do Sol a −6°, calculados por coordenadas na mesma fonte. As transições artísticas do fundo continuam graduais; não substituímos a identidade visual por uma visualização científica.

`getMoonTimes` varre um dia UTC. A atmosfera reúne os dias UTC que intersectam o dia civil municipal e filtra eventos pelo intervalo local `[meia-noite, próxima meia-noite)`, inclusive dias de 23/25 horas. Não usa timezone do dispositivo. Ausência de nascer/pôr nesse dia é legítima e difere de falha da efeméride. Horários são aproximados e não representam o horizonte real do usuário. Iluminação usa a fração da mesma leitura astronômica, em vez de recalcular o percentual a partir da fase.

## Silêncio e severidade

O mínimo vale para tipos selecionados, inclusive INMET; resumo diário segue sua seleção própria. O backend existente já filtra severidade e janela silenciosa, sem necessidade de redeploy ou migration. O silêncio inclui o início e exclui o fim, podendo cruzar meia-noite. É interpretado no fuso escolhido, válido para todas as cidades monitoradas. Severidade 4 pode interrompê-lo. O resumo ocorre no horário local de cada cidade e é suprimido se coincidir com o silêncio. Não há fila de entrega desses avisos após o fim do silêncio. Cooldown de seis horas permanece.

## Validação e limites

Testes unitários cobrem alinhamento de chuva, seleção/empate, meia-noite, idades/lacunas, extremos, alertas, dados opcionais, eventos lunares, horizonte, DST, cache/troca de cidade, iluminação, METAR e preservação/revisão de preferências. `verify-daily-planning.py` exercita a UI real/SDK local com fixtures, incluindo salvar/limpar silêncio, severidade, quatro viewports, dados salvos/tempestade e troca de cidade com timezone do aparelho em Tóquio. `verify-nowcast.py` também verifica vento observado.

Auth, Push e clima são interceptados nos testes de browser. Nenhum teste envia Web Push real ou modifica contas de produção. Testes com fixtures não comprovam OAuth habilitado, meteorologia real ou iPhone físico. Resultados finais desta release são registrados no PR; o projeto publica `dist/`, sem build/lint frontend configurado.

## Próxima evolução fundamentada

Avaliar os critérios de planejamento com feedback real antes de personalizar atividades. Fortalecer tratamento de avisos futuros/áreas incertas e amostras opcionais. Ativar OAuth seguro com o proprietário e testar consentimento/retorno em Safari/PWA. Obter radar SIPAM autorizado antes de adicionar detecção ou ETA ao piloto Nowcast; vento METAR não fornece vetor de deslocamento de células de chuva.
