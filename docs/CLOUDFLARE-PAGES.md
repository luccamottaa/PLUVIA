# Mudança para o Cloudflare Pages

Pedido do dono (28/10/2026): publicar o PLUVIA no Cloudflare Pages em vez do GitHub Pages. Motivos: um lugar só
(hoje é Cloudflare na frente e GitHub atrás), preview de cada PR em `*.pages.dev` no lugar da Vercel (o domínio
cadastrado na Vercel e um registro `A 216.198.79.1` esquecido no DNS causaram um laço de redirecionamento em
28/10/2026) e controle de cabeçalhos por `dist/_headers`.

Nada muda no código do app: o Pages publica a mesma pasta `dist/`, sem build.

## O que o repositório já faz para o Pages

- `dist/404.html`: sem ele o Pages entende o site como SPA e responde **qualquer** endereço inexistente com o
  `index.html` e status 200; um script que faltasse viraria HTML guardado pelo service worker.
- `sw.js`: o Pages responde `/index.html` com 308 para `/`. O shell é baixado à parte e guardado sem a marca de
  redirecionamento (`unwrap`), porque o Safari recusa uma navegação servida pelo SW com resposta redirecionada
  (o app não abriria offline). `remember` faz o mesmo nas atualizações.
- `dist/_headers`: `/sw.js` com `Cache-Control: no-cache`. Os demais arquivos ficam com o padrão do Pages
  (`max-age=0, must-revalidate`, revalidado por ETag) e a Cache Rule da zona continua dando 1 ano aos arquivos com
  `?v=` (ver `docs/CLOUDFLARE.md`).
- `scripts/check-release.cjs` espera até 6 min pelo HTML novo: no Pages quem publica é o Cloudflare, e o job de
  verificação do GitHub pode começar antes.
- `wrangler.jsonc` (raiz) e `worker/pluvia.mjs`: o projeto criado no painel em 28/10/2026 é um **Worker**
  (`pluviaweather`) que entrega a pasta `dist/` pelo binding `ASSETS`, não um projeto Pages clássico. O
  `wrangler.jsonc` fixa a pasta, a página 404 com status 404 (`not_found_handling: "404-page"`) e o
  `/index.html` → `/` (`auto-trailing-slash`, tratado pelo `unwrap`). O comando de publicação do painel é
  `npx wrangler deploy`.
- **Por que há código no Worker** (`run_worker_first`): atrás de um Worker, as Cache Rules da zona de
  `docs/CLOUDFLARE.md` não valem mais. Em 02/11/2026, logo depois da troca do domínio, o `app.js?v=…` saía com
  `max-age=0`. O Worker devolve o cache de um ano aos arquivos com `?v=` e às fontes, deixa `/sw.js` sem cache,
  manda o `www` para o domínio sem www (301; antes o GitHub fazia), acrescenta cabeçalhos de segurança
  (`nosniff`, `Referrer-Policy`, HSTS sem preload, `Permissions-Policy` com localização e microfone só na própria
  página, `X-Frame-Options: SAMEORIGIN`) e põe as pré-conexões do `<head>` num cabeçalho `Link` no HTML, que o
  Early Hints da zona transforma em resposta 103. Cada pedido conta como uma execução do Worker (plano gratuito:
  100 mil por dia; o PLUVIA fica muito abaixo, e quem volta é servido pelo service worker).
- `dist/.assetsignore`: `CNAME`, `.nojekyll` e `dev-server.cjs` não sobem para o Worker (são do GitHub Pages e
  do preview local).
- `CNAME` e `.nojekyll` continuam em `dist/` só para o GitHub Pages, que segue como reserva durante a troca.

## Passo a passo (painel da Cloudflare, quem tem acesso)

1. **Workers & Pages → Create → Pages → Connect to Git** → repositório `luccamottaa/PLUVIA`.
2. Configuração: *Production branch* `main`; *Framework preset* None; *Build command* vazio;
   *Build output directory* `dist`. Salvar e publicar.
3. Testar o endereço `https://<projeto>.pages.dev/`: Home, troca de cidade, `/clima/manaus-am/`, `/termos/`,
   um endereço inexistente (precisa dar a página "não encontrada" com 404), e o app offline depois de uma visita.
4. **Configurações → Domínios e rotas → Adicionar → Domínio personalizado** → `pluviaweather.com.br` (e depois
   `www`). O Cloudflare recusa ("already has externally managed DNS records") enquanto existirem os registros do
   GitHub: apagar antes no DNS os quatro `A` (`185.199.108–111.153`) e o `CNAME www`; o site fica fora até o
   domínio ser adicionado (segundos). Conferir que não sobrou nenhum `A` antigo, nem o `216.198.79.1` da Vercel.
5. Rodar `curl -sI https://pluviaweather.com.br/` e conferir que não aparece `x-github-request-id`.
6. Depois de alguns dias estável: desligar o GitHub Pages no repositório, trocar o `pages.yml` para só verificar
   (sem publicar) e apagar o projeto e o domínio da Vercel.

## Para desfazer

Remover o domínio personalizado do projeto no Pages e recriar no DNS os quatro `A` do GitHub
(`185.199.108.153` a `185.199.111.153`, com proxy) e o `CNAME www` → `luccamottaa.github.io`. O GitHub Pages
continua publicando enquanto o `pages.yml` não for mudado.

## Painel da zona depois da troca (recomendado)

- **Velocidade → Otimização → Early Hints**: ligado (usa o `Link` que o Worker manda no HTML).
- **HTTP/3** e **Brotli**: já vêm ligados (conferido: `alt-svc: h3` e `content-encoding: br`).
- **SSL/TLS → Certificados de borda → Sempre usar HTTPS**: ligado.
- Continuam desligados: **Rocket Loader**, ofuscação de e-mail e **Web Analytics/RUM** (ver `docs/CLOUDFLARE.md`).
- As Cache Rules antigas ("Arquivos versionados" e "Service worker sem cache") ficam inofensivas; o Worker faz o
  trabalho delas.
