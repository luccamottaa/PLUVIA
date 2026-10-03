# E-mails e ciclo da conta

## O que esta etapa entrega

`supabase/templates/confirmation.html` e `recovery.html` usam a identidade do Pluvia, português, preheader, botão grande, link copiável e explicação para quem não solicitou o e-mail. Tabelas e estilos inline permitem leitura em clientes de e-mail; não há fontes remotas, pixels, script ou interpolação de nomes arbitrários. `{{ .ConfirmationURL }}` preserva o link seguro e descartável gerado pelo Supabase. Não fixar token, redirecionamento ou prazo de expiração no template.

Assuntos: **Confirme seu e-mail e entre no Pluvia** e **Redefina sua senha do Pluvia**.

## Aplicação no projeto hospedado

O `config.toml` referencia os arquivos para desenvolvimento local. Isso **não altera o projeto hospedado automaticamente**. O conector Supabase atual não expõe alteração de configuração Auth, e o ambiente não possui credencial da Management API. Portanto os templates estão preparados no repositório; não foi confirmado seu uso em e-mails reais.

No [Dashboard de templates](https://supabase.com/dashboard/project/dszyyrcvwrpyiypwyvxe/auth/templates), aplicar assunto e HTML em **Confirm sign up** e **Reset password**, preservando confirmação obrigatória. Alternativa em ambiente confiável do proprietário: `python scripts/apply-auth-emails.py --apply`, com `SUPABASE_ACCESS_TOKEN` configurado fora do código/chat. O script altera somente quatro campos e verifica a leitura posterior; sem `--apply` imprime apenas o payload público. Não usar `supabase config push` com configuração incompleta, pois isso pode sobrescrever outros ajustes.

Em [URL Configuration](https://supabase.com/dashboard/project/dszyyrcvwrpyiypwyvxe/auth/url-configuration), configurar **Site URL: https://pluviaweather.com.br/** e adicionar estes destinos exatos em **Redirect URLs**:

- `https://pluviaweather.com.br/` — confirmação de cadastro;
- `https://pluviaweather.com.br/?auth_recovery=1` — recuperação de senha;
- `https://pluviaweather.com.br/?auth_return=1` — retorno de login social.

O formulário de recuperação só se abre após o evento `PASSWORD_RECOVERY` do SDK com sessão; o parâmetro sozinho nunca autoriza troca. Links expirados recebem mensagem segura, sem `error_description` bruto.

### Redirecionamento indevido à Vercel identificado em 03/10/2026

GET `/auth/v1/verify` com token deliberadamente inválido e `redirect: manual` retornou HTTP 303 para **https://pluvia-lucca-49c6.vercel.app/**, tanto sem destino quanto solicitando os três destinos públicos acima. O endereço antigo respondeu HTTP 302 para `vercel.com/sso-api`; o domínio público do Pluvia respondeu HTTP 200. Isso confirma o fallback hospedado errado e a recusa dos destinos públicos naquele momento, sem cadastrar pessoas ou enviar e-mails.

`social-auth.redirectTo(location, flow)` agora concentra os destinos de confirmação, recuperação e OAuth. Em produção, sempre usa o domínio público e a raiz; não herda previews, caminhos, query ou tokens da página onde o cadastro começou. Somente `localhost` e `127.0.0.1` mantêm o retorno de desenvolvimento. Um retorno local real também exige allowlist local no Supabase; os testes usam interceptação.

**A alteração do frontend não modifica Site URL nem a allowlist hospedada.** O proprietário precisa salvar os valores acima no Dashboard. Remover o endereço Vercel antigo da allowlist se estiver cadastrado, incluindo padrões obsoletos que o aceitem: links já enviados podem conter `redirect_to` antigo e continuar usando-o quando permitido. Não desativar confirmação de e-mail nem liberar a proteção dos previews para contornar o problema. Manter `{{ .ConfirmationURL }}` nos templates hospedados; não colocar um link direto para o site no botão, pois isso não valida o token.

Depois de salvar, executar `node scripts/verify-auth-redirects.cjs`. O script confirma o fallback e os três destinos com token inválido, recusa destino externo e não segue redirects, imprime fragmentos/tokens ou envia e-mails. No ambiente gerenciado com proxy, usar `NODE_USE_ENV_PROXY=1`. Sucesso desse diagnóstico confirma somente os retornos; entrega e confirmação de um e-mail real ainda devem ser verificadas numa caixa controlada pelo proprietário.

`python scripts/verify-auth-redirects.py` verifica cadastro e recuperação com SDK real, origens pública/preview/local e retorno de confirmação em outra sessão; somente fixtures e requests interceptados. Chromium e WebKit executam esse teste no workflow de interface. Isso não altera a configuração hospedada nem comprova entrega SMTP.

Remetente/domínio próprios exigem SMTP configurado e DNS do serviço (SPF/DKIM/DMARC). Não foram alterados remetente, SMTP, limites ou entregabilidade. Um template bonito não comprova recebimento. No provedor SMTP, desativar rastreamento de links de Auth. Teste final de entrega deve usar caixa controlada pelo proprietário; não enviamos mensagens a usuários reais como teste.

## Falha de envio identificada em 01/10/2026

Os logs Auth confirmaram `/recover` e `/signup` retornando HTTP 500 / `unexpected_failure`: o Resend rejeitou o remetente porque **auth.pluviaweather.com.br não está verificado**. O DNS público no Registro.br não contém os registros desse subdomínio; o domínio principal **pluviaweather.com.br** já contém registros DKIM e de envio. Isso não confirma o status de verificação no painel do Resend.

Se o domínio principal estiver Verified no Resend, ajustar **Sender email** em [Supabase SMTP](https://supabase.com/dashboard/project/dszyyrcvwrpyiypwyvxe/auth/smtp) para um endereço no domínio verificado, por exemplo `no-reply@pluviaweather.com.br`, preservando host/porta/usuário/credencial, confirmação obrigatória e nome Pluvia. Alternativa: adicionar e verificar o subdomínio `auth.pluviaweather.com.br` com os valores gerados pelo Resend, dentro da zona DNS existente do Registro.br. Não inventar valores DKIM/SPF, não alterar os registros do site e não desativar confirmações para contornar o erro.

O conector disponível não modifica a configuração SMTP e não há credencial da Management API neste ambiente. A correção do frontend diferencia falha do serviço, limite e rede, sem exibir domínio, destinatário ou erro SMTP bruto; não afirma que um envio recusado funcionou. Ela não corrige o remetente hospedado. Após o ajuste administrativo, validar entrega e link numa caixa controlada pelo proprietário mediante pedido explícito; não registrar tokens/senhas em logs ou relatório.

## Recuperação e exclusão

`account.js` mantém o cliente Auth único. Recuperação usa `resetPasswordForEmail`, mensagem sem enumeração de contas e cooldown de um minuto após sucesso. Nova senha passa pela regra existente e confirmação; `updateUser({password})` só ocorre na sessão de recuperação. Senhas são apagadas após salvar/fechar. Não migrar o fluxo global implicit para PKCE sem rever cadastro/retorno entre dispositivos.

`account-delete` exige JWT, `getUser` no servidor, origem permitida, proprietário correspondente e confirmação EXCLUIR. A autenticação real em `amr` deve ter até dez minutos; `iat`/refresh não renovam esse prazo. Primeiro revoga refresh sessions globais, depois chama hard delete apenas do próprio ID. FKs reais foram conferidas: notificações, assinaturas e quota individual são removidas em cascata. Metadata de preferências desaparece junto da conta. Caches meteorológicos públicos não são dados de perfil.

Access tokens já emitidos podem sobreviver até a expiração, embora as funções sensíveis confiram o usuário via Auth e as linhas tenham sido removidas. Não prometer revogação instantânea de todo JWT nem eliminação imediata em backups. Se a revogação funcionar e a exclusão falhar, será preciso entrar novamente; o cliente não afirma exclusão sem confirmação `{deleted:true}`. Cópias de segurança seguem a política do Supabase. A aplicação não usa Storage para uploads de usuários.

Publicar a função com verify_jwt=true antes da interface. Não efetuar exclusões reais para teste. Regras/endpoint são testados com mocks; `scripts/verify-account-lifecycle.py` usa SDK real e intercepta recuperação, alteração de senha e exclusão em contas fictícias.
