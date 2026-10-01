# Resultado da etapa de conta e experiência — 01/10/2026

Preservados: painel público, Auth por e-mail, suporte social condicionado a provider habilitado, favoritos/comparação, astronomia, APIs, cache e publicação estática.

Entregas:
- Recuperação de senha por Auth e callback real do SDK, confirmação de nova senha e mensagens sem enumeração.
- Exclusão da própria conta com confirmação explícita, autenticação recente verificada no servidor, revogação e cascatas existentes. Função account-delete v1 publicada ACTIVE com JWT obrigatório antes do frontend.
- Templates próprios de confirmação/recuperação, sem rastreio, e aplicação seletiva verificável. Ainda não aplicados ao Auth hospedado: falta acesso de configuração, não código de envio alternativo.
- Avisos municipais do INMET nos favoritos, com fonte/severidade/validade e freshness; leitura nacional reutilizada. Validade sem timezone municipal conhecido identifica Brasília, sem depender do dispositivo.
- Transição leve de 320ms ao abrir os diálogos, backdrop gradual e detalhes suaves; reduced motion sem animação. Foco/teclado/viewport nativos preservados.
- Contratos visuais Chromium/WebKit automatizados em CI, screenshots de estados e regressões de conta.
- Monitor público duas vezes/dia, diagnósticos agregados do orçamento/cron e avaliação de nowcast documentada.

Bug confirmado: quando o catálogo completo estava disponível, a seleção INMET podia aceitar município de nome único apesar de região explícita conflitante. Fallback por unicidade agora exige ausência de região informada. O matcher continua compartilhado por painel e favoritos. Atualizações de cards preservam o favorito focado.

Validação local: 280 entradas de teste aprovadas, sintaxe de JS publicada aprovada, Deno check em todas as funções aprovado. Chromium/WebKit: sete viewports, céu em sete estados, loading, stale, erro, aviso oficial, favorito, transição/reduced motion, SDK real de recuperação e exclusão fictícia, sincronização em dois dispositivos sem erros de página. Templates renderizados em 390px sem overflow, com inspeção visual. Isso não prova Gmail/Outlook real nem entrega de e-mail.

Validação de produção anterior ao merge: seis fontes públicas prontas; endpoint de exclusão responde 401 a anônimo, 204 a preflight permitido e 403 a origem não permitida. Nenhuma conta real foi apagada, senha real alterada ou mensagem enviada para teste. CI/publicação devem ser conferidos no PR, sem inferir sucesso a partir destes resultados.

O projeto não configura lint, tsconfig frontend ou build de bundler. Deno verifica os tipos backend; GitHub Pages publica dist após testes. Não há resultados fictícios de npm run lint/build.

Limites: ativação de templates e remetente SMTP, Google/Apple com credenciais próprias, iPhone físico, baseline pixel a pixel, orçamento global PostHog e validação regional de nowcast. Consulte ACCOUNT-EMAILS.md, OPERATIONS-AND-QA.md e NOWCAST-EVALUATION.md. Não apresentamos dados horários interpolados como chuva começando em minutos.
