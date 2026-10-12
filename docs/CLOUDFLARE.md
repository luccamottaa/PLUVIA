# Cloudflare na frente do GitHub Pages (cache longo)

O GitHub Pages responde todo arquivo com `Cache-Control: max-age=600` (10 min) e não deixa mudar isso. É o aviso
"Use ciclos de vida eficientes de cache" do PageSpeed. O service worker já serve os arquivos versionados do
aparelho para quem volta, mas a primeira visita (e o PageSpeed) só melhora com um cabeçalho de cache longo, e
para isso é preciso um CDN na frente. O plano gratuito do Cloudflare resolve.

Nada disso muda o repositório nem o deploy: o GitHub Pages continua publicando `dist/` no push para `main`.

## Estado em produção (12/10/2026)

Configurado e medido: HTML, `sw.js`, `manifest.webmanifest`, páginas `/clima/` e arquivos sem `?v=` saem com
`max-age=600`; JS/CSS/imagens com `?v=` e as fontes saem com `max-age=31536000` e `cf-cache-status: HIT`.
O `/sw.js` tem a regra "Service worker sem cache" (Bypass) e sai com `cf-cache-status: DYNAMIC`: a borda nunca
segura uma versão antiga do service worker depois de um deploy.
Conferir de novo com `curl -sI "https://pluviaweather.com.br/app.js?v=<versão>&x=$RANDOM"` (o parâmetro extra
evita uma resposta guardada antes de uma mudança na regra).

## Passo a passo (quem tem acesso ao domínio)

1. Criar conta em cloudflare.com → **Add a site** → `pluviaweather.com.br` → plano **Free**.
2. Conferir os registros que o Cloudflare importou. Precisam existir, com a nuvem laranja (Proxied):
   - `A` `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` `www` → `luccamottaa.github.io`
   - Manter qualquer outro registro que já exista (e-mail, verificação do Google etc.).
3. No **registro.br**, trocar os servidores DNS do domínio pelos dois que o Cloudflare mostrar. A troca pode levar
   algumas horas.
4. **SSL/TLS → Overview**: modo **Full**. (Com "Flexible" o GitHub Pages entra em loop de redirecionamento.)
5. **Caching → Configuration → Browser Cache TTL**: **Respect Existing Headers**. O padrão da zona (4 horas)
   passa por cima dos 10 min do GitHub em tudo, inclusive `sw.js` e arquivos sem versão.
6. **Caching → Cache Rules → Create rule** "Arquivos versionados", em **Edit expression**, com esta expressão
   (não colar no campo "Valor" de uma condição *URI Full / wildcard*: a regra fica "Ativa" e não casa com nada):
   ```
   (http.request.uri.query contains "v=") or starts_with(http.request.uri.path, "/assets/fonts/")
   ```
   - Então: *Eligible for cache*; **Edge TTL** = ignorar o cabeçalho, 1 ano; **Browser TTL** = sobrescrever, 1 ano.
   - Só esses arquivos: a URL muda quando o conteúdo muda (a regra do `?v=` no AGENTS.md), então guardar por um
     ano é seguro. HTML, `sw.js`, `manifest.webmanifest` e páginas `/clima/` continuam com os 10 min do GitHub.
7. **Web Analytics / Real User Monitoring: desligado.** Ligado, a Cloudflare injeta `beacon.min.js` em toda página,
   para todo visitante, sem o consentimento que o PostHog exige; a Privacidade diz que ele fica desligado, e o
   beacon também derrubava o PageSpeed (0,92 → 0,71 numa rodada com ele).
8. **Speed → Optimization**: deixar **Rocket Loader desligado** (ele reordena os scripts e quebra a ordem de
   carregamento do PLUVIA). **Scrape Shield → Email Address Obfuscation desligado** (muda o HTML e faz o
   `check-release.cjs` do deploy acusar arquivo diferente).
9. Depois da troca de DNS: rodar o PageSpeed de novo. O aviso de cache deve sumir para os arquivos com `?v=`.

## Cuidados

- A borda guarda também os arquivos **sem** versão que o Cloudflare cacheia por extensão (o `sw.js`) pelos
  10 min do GitHub Pages. Logo depois de um deploy ela ainda entrega o `sw.js` anterior: a atualização do
  service worker chega a quem abre o app com até 10 min de atraso, e o `check-release.cjs` do deploy #217
  acusou `content_mismatch`. O `check-release.cjs` agora pede esses arquivos com `?release-check=<hash>`
  (outra chave de cache). Para a borda nunca segurar o `sw.js` existe a Cache Rule "Service worker sem cache":
  expressão `(http.request.uri.path eq "/sw.js")` → **Ignorar cache** (Bypass). A posição na lista não importa
  (a regra dos versionados só casa com `?v=` e fontes). Atenção: a ação precisa ser "Ignorar cache"; com
  "Qualificado para cache" a regra fica ativa e não muda nada.

- O certificado HTTPS do GitHub Pages ("Enforce HTTPS") continua ligado; com o modo Full o Cloudflare fala com ele
  em HTTPS.
- Se um JS/CSS publicado mudar **sem** trocar o `?v=`, o Cloudflare (e o navegador) vão servir a versão antiga por
  até um ano. Os testes de contrato já travam as versões; nunca contorne isso. Vale também para imagens e SVGs
  referenciados por CSS/HTML (logo, Lua, chuva, raios já levam `?v=`): trocar o arquivo exige trocar a versão.
- Para desfazer: voltar os servidores DNS antigos no registro.br. Nada no código depende do Cloudflare.
