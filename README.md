# PLUVIA

Painel climático ao vivo de Manaus com previsão, chuva, umidade, vento, sensação térmica, qualidade do ar e atalhos para alertas oficiais.

## Acessar

- Site atual: [pluvia.luccamotta.chatgpt.site](https://pluvia.luccamotta.chatgpt.site)
- GitHub Pages: `https://luccamottaa.github.io/PLUVIA/` (publicado automaticamente após cada envio para `main`)

## Estrutura

```text
dist/
├── index.html       # estrutura e conteúdo do painel
├── styles.css       # identidade visual, liquid glass e animações
├── app.js           # dados climáticos e comportamento da interface
├── logo-pluvia.png  # assinatura completa
├── logo-mark.png    # ícone e favicon
└── .nojekyll        # publicação estática sem processamento do Jekyll

.github/workflows/pages.yml  # publicação automática no GitHub Pages
.openai/hosting.json         # vínculo com o projeto PLUVIA no ChatGPT Sites
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
- Comunicados locais: Defesa Civil de Manaus

Os horários exibidos usam `America/Manaus` (AMT, UTC−4).

## Publicação

O workflow em `.github/workflows/pages.yml` envia o conteúdo de `dist` para o GitHub Pages sempre que a branch `main` recebe alterações.

