# Cloudflare na frente do GitHub Pages (cache longo)

O GitHub Pages responde todo arquivo com `Cache-Control: max-age=600` (10 min) e não deixa mudar isso. É o aviso
"Use ciclos de vida eficientes de cache" do PageSpeed. O service worker já serve os arquivos versionados do
aparelho para quem volta, mas a primeira visita (e o PageSpeed) só melhora com um cabeçalho de cache longo, e
para isso é preciso um CDN na frente. O plano gratuito do Cloudflare resolve.

Nada disso muda o repositório nem o deploy: o GitHub Pages continua publicando `dist/` no push para `main`.

## Passo a passo (quem tem acesso ao domínio)

1. Criar conta em cloudflare.com → **Add a site** → `pluviaweather.com.br` → plano **Free**.
2. Conferir os registros que o Cloudflare importou. Precisam existir, com a nuvem laranja (Proxied):
   - `A` `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` `www` → `luccamottaa.github.io`
   - Manter qualquer outro registro que já exista (e-mail, verificação do Google etc.).
3. No **registro.br**, trocar os servidores DNS do domínio pelos dois que o Cloudflare mostrar. A troca pode levar
   algumas horas.
4. **SSL/TLS → Overview**: modo **Full**. (Com "Flexible" o GitHub Pages entra em loop de redirecionamento.)
5. **Caching → Cache Rules → Create rule** "Arquivos versionados":
   - Quando: *URI Query String* contém `v=` **ou** *URI Path* começa com `/assets/fonts/`
   - Então: *Eligible for cache*; **Edge TTL** = ignorar o cabeçalho, 1 ano; **Browser TTL** = sobrescrever, 1 ano.
   - Só esses arquivos: a URL muda quando o conteúdo muda (a regra do `?v=` no AGENTS.md), então guardar por um
     ano é seguro. HTML, `sw.js`, `manifest.webmanifest` e páginas `/clima/` continuam com os 10 min do GitHub.
6. **Speed → Optimization**: deixar **Rocket Loader desligado** (ele reordena os scripts e quebra a ordem de
   carregamento do PLUVIA). **Scrape Shield → Email Address Obfuscation desligado** (muda o HTML e faz o
   `check-release.cjs` do deploy acusar arquivo diferente).
7. Depois da troca de DNS: rodar o PageSpeed de novo. O aviso de cache deve sumir para os arquivos com `?v=`.

## Cuidados

- O certificado HTTPS do GitHub Pages ("Enforce HTTPS") continua ligado; com o modo Full o Cloudflare fala com ele
  em HTTPS.
- Se um JS/CSS publicado mudar **sem** trocar o `?v=`, o Cloudflare (e o navegador) vão servir a versão antiga por
  até um ano. Os testes de contrato já travam as versões; nunca contorne isso.
- Para desfazer: voltar os servidores DNS antigos no registro.br. Nada no código depende do Cloudflare.
