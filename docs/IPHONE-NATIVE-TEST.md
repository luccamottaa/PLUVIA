# PLUVIA no iPhone sem Mac (teste pessoal)

Este é um empacotamento iOS experimental do `dist/` com Capacitor. Ele não muda a publicação do site, não exige uma conta Apple Developer paga e **não é uma versão pronta para a App Store**.

## Gerar o arquivo

Na aba Actions do repositório, abra **Gerar PLUVIA para teste no iPhone**. Na branch `feat/ios-device-test`, o primeiro envio executa o fluxo automaticamente. Depois que o fluxo estiver na branch padrão, também é possível usar **Run workflow**. Ao terminar com sucesso, baixe o artefato **PLUVIA-iPhone-teste** e extraia `PLUVIA-unsigned.ipa` do ZIP baixado. Não tente instalar o ZIP ou o IPA diretamente pelo Safari: ele ainda precisa ser assinado no seu PC.

O build usa um Mac temporário do GitHub Actions, mas **não envia sua conta Apple nem suas credenciais** ao GitHub. O arquivo gerado é não assinado, específico para teste pessoal.

## Instalar usando Windows

1. Baixe o AltServer **somente de** [altstore.io](https://altstore.io/) e siga o [guia oficial para Windows](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows). O guia pede iTunes e iCloud obtidos diretamente da Apple, um cabo para o primeiro pareamento e o AltServer em execução.
2. Instale o AltStore no iPhone pelo AltServer. A conta Apple é informada **no seu próprio PC**, nunca neste repositório nem para outra pessoa. Se preferir, crie uma conta Apple separada só para o teste.
3. No iPhone, abra o AltStore, toque em **My Apps → +** e selecione `PLUVIA-unsigned.ipa`. O AltStore assina e instala o app para o seu aparelho. Ative o Modo de Desenvolvedor no iPhone se o sistema solicitar.
4. Reabra o AltStore com o AltServer disponível antes de completar sete dias para renovar a assinatura. Com uma conta Apple gratuita, a instalação expira se não for renovada.

## Limites deste primeiro teste

- Previsão, busca, mapa e login por senha devem ser validados no aparelho; não foram testados em um iPhone físico por este fluxo de build.
- Confirmação de cadastro por e-mail abre o site público. Depois de confirmar, volte ao app e entre com e-mail e senha; não há retorno automático por deep link.
- O site continua usando Web Push normalmente, mas **o app nativo ainda não recebe notificações**. É necessária uma integração separada com APNs para isso.
- A localização solicita a permissão do iOS. Se não funcionar no primeiro build, busque a cidade pelo nome e registre o comportamento para corrigirmos.
- O IPA gerado é um artefato temporário de desenvolvimento, não é para compartilhar como distribuição pública.
