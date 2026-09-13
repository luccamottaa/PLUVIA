# PLUVIA

Painel climático brasileiro feito em Manaus, com chuva, previsão, qualidade do ar e alertas oficiais. “Olha o céu antes de sair.”

## Acessar

- Site atual: [pluvia.luccamotta.chatgpt.site](https://pluvia.luccamotta.chatgpt.site)
- GitHub Pages: `https://luccamottaa.github.io/PLUVIA/` (publicado automaticamente após cada envio para `main`)

## Estrutura

```text
dist/
├── index.html       # estrutura e conteúdo do painel
├── styles.css       # identidade visual, liquid glass e animações
├── app.js           # dados climáticos e comportamento da interface
├── modules/signal.js # regras puras e transparentes do PLUVIA Sinal
├── capitals.js      # capitais e carregadores lazy de municípios
├── municipality-index.js # índice leve usado pela busca
├── cities/          # coordenadas e fuso carregados por UF
├── municipalities.js # catálogo completo, carregado somente para GPS
├── logo-pluvia.png  # assinatura completa
├── logo-mark.png    # ícone e favicon
├── icon-192.png     # ícone PWA
├── icon-512.png     # ícone PWA
├── icon-maskable-512.png # ícone seguro para recorte adaptativo
├── og-pluvia.png    # compartilhamento social 1200×630
└── .nojekyll        # publicação estática sem processamento do Jekyll

.github/workflows/pages.yml  # publicação automática no GitHub Pages
.openai/hosting.json         # vínculo com o projeto PLUVIA no ChatGPT Sites
scripts/chunk-municipalities.cjs # regenera índice e arquivos por UF
```

## Desenvolvimento local

O projeto é estático e não exige instalação de dependências. Sirva a pasta `dist` com qualquer servidor HTTP local. Exemplo:

```bash
python3 -m http.server 8080 --directory dist
```

Depois, abra `http://localhost:8080`.

## Dados

- Clima e previsão: Open-Meteo
- Qualidade do ar: Open-Meteo Air Quality
- Alertas meteorológicos: INMET
- Comunicados locais: Defesa Civil de Manaus; fora de Manaus, orientação da Defesa Civil Nacional
- Municípios: IBGE; coordenadas de Kelvin S. do Prado, sob licença MIT

Cada cidade usa seu próprio fuso. Os dados são referência do ponto municipal, não da rua do visitante.

O PLUVIA Sinal cruza previsão, vento, calor, UV, qualidade do ar e avisos oficiais. A regra é determinística, expõe os fatores usados e reduz a confiança quando alguma fonte essencial está indisponível.

Ao atualizar `dist/municipalities.js`, regenere os arquivos menores com:

```bash
node scripts/chunk-municipalities.cjs
```

## Publicação

O workflow em `.github/workflows/pages.yml` envia o conteúdo de `dist` para o GitHub Pages sempre que a branch `main` recebe alterações.
