# Google e Apple na conta do Pluvia

## Estado verificado e arquitetura

Em 01/10/2026, GET público /auth/v1/settings do projeto dszyyrcvwrpyiypwyvxe respondeu HTTP 200: Google false, Apple false, e-mail true. Integração do frontend pronta; não confundir botões implementados com provedores habilitados. Não há ferramenta de configuração Auth nem credenciais Google/Apple disponíveis nesta sessão.

O app reutiliza Supabase Auth e o SDK local 2.116.0. Primeiro login social cria a conta automaticamente; seguintes acessam a mesma identidade conforme vinculação do Supabase. Não há cadastro paralelo, nova tabela ou senha local para conta social. Não vincular contas manualmente pelo texto do e-mail; Apple pode entregar e-mail privado relay.

modules/social-auth.js concentra descoberta, allowlist Google/Apple, destino de retorno, validação do endpoint authorize e limpeza de callback. Descoberta usa cliente HTTP próprio, timeout 6s, deduplicação e freshness 5min. Falha/esquema inválido mantém opções ocultas e tenta de novo em nova abertura após 10s, sem polling. Não autentica por flags locais.

account.js mantém cliente único, fluxo browser existente (implicit, documentado pelo Supabase para apps sem SSR), detectSessionInUrl e sincronização existente. Não foi alterado para PKCE global: isso mudaria o contrato de confirmação de e-mail existente. Não há segundo cliente, popup, SDK Google/Apple, coleta adicional de tokens ou execução manual do exchange. Supabase valida OAuth/state e autentica; o frontend só usa a sessão devolvida pelo SDK. Analytics não recebe tokens, URL, nome ou e-mail.

Retorno usa https://pluviaweather.com.br/?auth_return=1, sem herdar query/hash ou destino informado pelo usuário. Cancelamento e erro mostram texto fixo; a URL transitória é limpa somente depois da inicialização do SDK. Sem nome (comum com Apple OAuth), abre o formulário de perfil já existente; nome não é inventado a partir do e-mail. Google full_name continua disponível se o snapshot ainda não possui nome editado. SDK tem timeout de 12s; botões não permitem requests concorrentes e se recuperam de navegação não concluída/retorno por histórico.

## Ativação no servidor — necessária

Projeto: https://supabase.com/dashboard/project/dszyyrcvwrpyiypwyvxe/auth/providers

1. Em URL Configuration, conferir Site URL https://pluviaweather.com.br e adicionar retorno EXATO https://pluviaweather.com.br/?auth_return=1 à allowlist. Preservar o retorno de e-mail existente. Não usar wildcard amplo de produção.
2. Configurar cada provedor abaixo no painel Supabase, com secrets exclusivamente no servidor. Não enviar valores em chat, GitHub, código público ou analytics.
3. Depois de salvar, recarregar a página ou aguardar freshness da descoberta e abrir Minha conta. Cada botão só aparece se settings.external desse provedor for true.
4. Testar com conta de teste autorizada, cancelar consentimento, entrar novamente, sair e conferir sincronização de favoritos/nome. Verificar Chrome, Safari e PWA instalado; redirect social em iOS pode abrir o navegador e a sessão pertence ao contexto que recebe o retorno. Não prometer sessão compartilhada entre Safari e standalone.

### Google

No Google Auth Platform/Cloud do proprietário, criar cliente OAuth tipo Web application:
- Origem JavaScript: https://pluviaweather.com.br
- Redirect URI do PROVEDOR: https://dszyyrcvwrpyiypwyvxe.supabase.co/auth/v1/callback
- Escopos básicos: openid, e-mail e perfil; nenhum acesso Drive/Gmail ou escopo offline.
- Configurar branding/audience. Enquanto estiver em Testing, somente test users habilitados podem entrar; publicar o aplicativo OAuth quando apropriado.
- Client ID/Client Secret entram no provedor Google do Supabase. Habilitar Google após essa configuração.

Não confundir URI Supabase callback (Google → Supabase) com auth_return (Supabase → Pluvia).

### Apple

Requer conta Apple Developer e configuração Sign in with Apple:
- App ID principal com capacidade Sign in with Apple.
- Services ID para Web ligado ao App ID; domínio pluviaweather.com.br.
- Return URL: https://dszyyrcvwrpyiypwyvxe.supabase.co/auth/v1/callback
- Team ID, Key ID e chave .p8 no ambiente seguro do proprietário para gerar client secret JWT.
- Services ID e secret entram no provedor Apple do Supabase; habilitar Apple após configuração.

O secret do fluxo web expira em até seis meses e precisa ser renovado antes do vencimento. Nunca colocar .p8 ou secret JWT no frontend. Não criar lembrete recorrente ou compra Apple Developer automaticamente. Apple OAuth não garante nome no retorno; o perfil existente resolve isso. Configuração de private email relay/entrega de e-mail deve ser conferida na conta Apple quando necessária.

## Validação e limites

Testes novos cobrem descoberta/timeout/freshness, provedores false/invalid, allowlist/destinos, cancelamento/limpeza do callback, botão social, erros, exclusão de concorrência, fallback e Apple sem nome/Google full_name. CI executa testes existentes, sintaxe e Deno. Ambiente local não disponível nesta sessão; resultados CI e QA remoto registrados no PR após execução.

OAuth real ponta a ponta permanece pendente enquanto provedores estiverem desativados. Não alegar criação de conta real, consentimento, vinculação ou funcionamento em iPhone físico a partir de testes com mocks.

Referências oficiais:
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/social-login/auth-apple
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/sessions/implicit-flow
