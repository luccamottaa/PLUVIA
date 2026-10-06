# Páginas das capitais (SEO)

## O que existe

- 27 páginas estáticas em `/clima/<nome>-<uf>/`, como `/clima/manaus-am/`, uma por capital.
  - A UF no endereço evita colisão quando houver municípios homônimos (Palmas-TO e Palmas-PR).
- Cada página é o mesmo app da Home com a cidade já escolhida, por `<meta name="pluvia-city">`.
- O conteúdo próprio de cada página é:
  - `<title>`, `description`, canonical, Open Graph e Twitter;
  - JSON-LD com `WebPage`, `City` (nome, estado e coordenadas de referência) e `BreadcrumbList`;
  - `<h1>` já com o nome da cidade, para quem lê o HTML sem executar o app;
  - uma nota factual no rodapé, por exemplo "Belém é a capital do Pará. Horários no fuso America/Belem (UTC−3)".
- O rodapé da Home e de todas as páginas tem "Previsão nas capitais", um `<details>` com os 27 links. São links internos rastreáveis. Na página de cidade, o link atual recebe `aria-current="page"`.
- O `sitemap.xml` lista a Home e as 27 páginas.
- O `robots.txt` já apontava para ele.

## Como gerar

```sh
node scripts/generate-city-pages.cjs          # grava páginas, bloco do rodapé e sitemap
node scripts/generate-city-pages.cjs --check  # falha se algo estiver desatualizado
```

- As páginas são derivadas do `index.html`. Toda mudança no shell (versões de JS/CSS, metadados, DOM) exige rodar o gerador.
- `tests/city-pages.test.cjs` falha se as páginas ficarem para trás.
- Slug, caminho e título vêm de `capitals.js` (`citySlug`, `cityPagePath`, `cityPageTitle`), as mesmas funções que o app usa.

## Comportamento

- **Cidade da página:** abre a própria cidade, como uma escolha explícita, mesmo com outra cidade salva. A escolha passa a ser a cidade salva, como numa troca manual.
- **Aviso de localização:** não aparece na página de cidade.
- **Localização automática:** a página de cidade não pede GPS ao abrir. Com a permissão já concedida, o GPS responderia sem perguntar e trocaria a cidade e a URL. Os botões de localização continuam funcionando quando a pessoa toca.
- **Troca de cidade numa página de cidade:**
  - a URL acompanha a cidade com `history.replaceState`: outra capital vai para a página dela, e um município sem página volta para `/`;
  - na Home o endereço nunca muda;
  - o `document.title` não é reescrito, por decisão anterior do produto.
- **Service worker:** a página de cidade fica em cache na própria URL e nunca vira o shell. Assim a Home offline não abre a cidade de outra pessoa. Sem cópia da página, o shell abre offline.
- **Caminhos:** os recursos carregados pelo JS usam caminhos da raiz (`/cities/…`, `/vendor/…`, `/sw.js`), porque as páginas vivem em subpastas.
  - Isso supõe o site na raiz do domínio: Pages com domínio próprio, Vercel ou o preview local.
  - Não usamos `<base href>`, porque ele quebra as referências `#id` de SVG (`<use>`, `url(#...)`).
- **Preview local:** `dev-server.cjs` serve `/pasta/` como `index.html` e redireciona `/pasta` para `/pasta/`, igual ao GitHub Pages.

## Limites

- O conteúdo meteorológico é renderizado por JavaScript. O Google executa JS, mas outros buscadores e as prévias sociais leem só o HTML estático: título, descrição, `h1`, nota e links.
- Não há texto climatológico por cidade. Normais e "clima típico" exigem fonte definida (ver `docs/DATA-SOURCES.md`) e não foram inventados.
- O QA (`verify-city-pages.py`) usa fixtures. Ele não mede indexação, posição em buscas nem Search Console.
- Depois de publicar, vale enviar o sitemap no Search Console. Isso é feito pelo dono do domínio, fora do repositório.
- Expandir para outros municípios exige decidir critério e conteúdo próprio, para evitar milhares de páginas quase iguais (conteúdo fino).
