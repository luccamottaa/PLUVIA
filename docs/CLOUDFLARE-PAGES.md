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
- `CNAME` e `.nojekyll` continuam em `dist/` só para o GitHub Pages, que segue como reserva durante a troca.

## Passo a passo (painel da Cloudflare, quem tem acesso)

1. **Workers & Pages → Create → Pages → Connect to Git** → repositório `luccamottaa/PLUVIA`.
2. Configuração: *Production branch* `main`; *Framework preset* None; *Build command* vazio;
   *Build output directory* `dist`. Salvar e publicar.
3. Testar o endereço `https://<projeto>.pages.dev/`: Home, troca de cidade, `/clima/manaus-am/`, `/termos/`,
   um endereço inexistente (precisa dar a página "não encontrada" com 404), e o app offline depois de uma visita.
4. **Custom domains → Set up a custom domain** → `pluviaweather.com.br` (e depois `www.pluviaweather.com.br`).
   O Cloudflare troca os registros `A` do GitHub (`185.199.108–111.153`) e o `CNAME www` pelo Pages. Conferir que
   não sobrou nenhum `A` antigo, nem o `216.198.79.1` da Vercel.
5. Rodar `curl -sI https://pluviaweather.com.br/` e conferir que não aparece `x-github-request-id`.
6. Depois de alguns dias estável: desligar o GitHub Pages no repositório, trocar o `pages.yml` para só verificar
   (sem publicar) e apagar o projeto e o domínio da Vercel.

## Para desfazer

Remover o domínio personalizado do projeto no Pages e recriar no DNS os quatro `A` do GitHub
(`185.199.108.153` a `185.199.111.153`, com proxy) e o `CNAME www` → `luccamottaa.github.io`. O GitHub Pages
continua publicando enquanto o `pages.yml` não for mudado.
