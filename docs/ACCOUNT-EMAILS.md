# E-mails e ciclo da conta

## O que esta etapa entrega

`supabase/templates/confirmation.html` e `recovery.html` usam a identidade do Pluvia, português, preheader, botão grande, link copiável e explicação para quem não solicitou o e-mail. Tabelas e estilos inline permitem leitura em clientes de e-mail; não há fontes remotas, pixels, script ou interpolação de nomes arbitrários. `{{ .ConfirmationURL }}` preserva o link seguro e descartável gerado pelo Supabase. Não fixar token, redirecionamento ou prazo de expiração no template.

Assuntos: **Confirme seu e-mail e entre no Pluvia** e **Redefina sua senha do Pluvia**.

## Aplicação no projeto hospedado

O `config.toml` referencia os arquivos para desenvolvimento local. Isso **não altera o projeto hospedado automaticamente**. O conector Supabase atual não expõe alteração de configuração Auth, e o ambiente não possui credencial da Management API. Portanto os templates estão preparados no repositório; não foi confirmado seu uso em e-mails reais.

No [Dashboard de templates](https://supabase.com/dashboard/project/dszyyrcvwrpyiypwyvxe/auth/templates), aplicar assunto e HTML em **Confirm sign up** e **Reset password**, preservando confirmação obrigatória. Alternativa em ambiente confiável do proprietário: `python scripts/apply-auth-emails.py --apply`, com `SUPABASE_ACCESS_TOKEN` configurado fora do código/chat. O script altera somente quatro campos e verifica a leitura posterior; sem `--apply` imprime apenas o payload público. Não usar `supabase config push` com configuração incompleta, pois isso pode sobrescrever outros ajustes.

Em [URL Configuration](https://supabase.com/dashboard/project/dszyyrcvwrpyiypwyvxe/auth/url-configuration), preservar os retornos existentes e permitir **https://pluviaweather.com.br/?auth_recovery=1**. O formulário de recuperação só se abre após o evento `PASSWORD_RECOVERY` do SDK com sessão; o parâmetro sozinho nunca autoriza troca. Caso a allowlist use fallback para Site URL, o evento continua sendo a referência. Links expirados recebem mensagem segura, sem `error_description` bruto.

Remetente/domínio próprios exigem SMTP configurado e DNS do serviço (SPF/DKIM/DMARC). Não foram alterados remetente, SMTP, limites ou entregabilidade. Um template bonito não comprova recebimento. No provedor SMTP, desativar rastreamento de links de Auth. Teste final de entrega deve usar caixa controlada pelo proprietário; não enviamos mensagens a usuários reais como teste.

## Recuperação e exclusão

`account.js` mantém o cliente Auth único. Recuperação usa `resetPasswordForEmail`, mensagem sem enumeração de contas e cooldown de um minuto após sucesso. Nova senha passa pela regra existente e confirmação; `updateUser({password})` só ocorre na sessão de recuperação. Senhas são apagadas após salvar/fechar. Não migrar o fluxo global implicit para PKCE sem rever cadastro/retorno entre dispositivos.

`account-delete` exige JWT, `getUser` no servidor, origem permitida, proprietário correspondente e confirmação EXCLUIR. A autenticação real em `amr` deve ter até dez minutos; `iat`/refresh não renovam esse prazo. Primeiro revoga refresh sessions globais, depois chama hard delete apenas do próprio ID. FKs reais foram conferidas: notificações, assinaturas e quota individual são removidas em cascata. Metadata de preferências desaparece junto da conta. Caches meteorológicos públicos não são dados de perfil.

Access tokens já emitidos podem sobreviver até a expiração, embora as funções sensíveis confiram o usuário via Auth e as linhas tenham sido removidas. Não prometer revogação instantânea de todo JWT nem eliminação imediata em backups. Se a revogação funcionar e a exclusão falhar, será preciso entrar novamente; o cliente não afirma exclusão sem confirmação `{deleted:true}`. Cópias de segurança seguem a política do Supabase. A aplicação não usa Storage para uploads de usuários.

Publicar a função com verify_jwt=true antes da interface. Não efetuar exclusões reais para teste. Regras/endpoint são testados com mocks; `scripts/verify-account-lifecycle.py` usa SDK real e intercepta recuperação, alteração de senha e exclusão em contas fictícias.
