# Fontes locais do PLUVIA

Obtidas em 2026-10-04 pela API CSS oficial do Google Fonts, sem alterar os arquivos WOFF2 recebidos.

- `inter-latin-v20.woff2` (desde a 1.15 fora do app, que usa a fonte do sistema; fica só para `scripts/generate-og-cities.py`): Inter, normal, eixo de peso 100–900, subconjunto Latin (48.256 bytes). Inclui os caracteres portugueses usuais. CSS de origem: <https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap>. Projeto: <https://github.com/rsms/inter>. Licença: `INTER-OFL.txt` (SIL OFL 1.1).
- `sora-latin-v1.woff2` (texto do app desde a 1.43): Sora, normal, eixo de peso 100–800, subconjunto Latin (33.652 bytes), do pacote `@fontsource-variable/sora` 5.3.0 (arquivo `sora-latin-wght-normal.woff2`, sem alterações). Inclui os caracteres portugueses e a feature `tnum`. Projeto: <https://github.com/sora-xor/sora-font>. Licença: `SORA-OFL.txt` (SIL OFL 1.1).
- `nunito-wordmark-v32.woff2`: Nunito, normal, peso 900, somente os caracteres de **PLUVIA** (1.128 bytes), preservando a assinatura existente. CSS de origem: <https://fonts.googleapis.com/css2?family=Nunito:wght@900&display=swap&text=PLUVIA>. Projeto: <https://github.com/googlefonts/nunito>. Licença: `NUNITO-OFL.txt` (SIL OFL 1.1).

`dist/fonts.css` declara os intervalos Unicode fornecidos pela origem. O texto da aplicação usa Sora (desde a 1.43) e fallback do sistema; somente as assinaturas da intro, cabeçalho e rodapé usam Nunito. Outros alfabetos usam o fallback do dispositivo. Não usar o subconjunto da marca em frases ou nomes pessoais.

As fontes do app (Sora e a marca) somam menos de 36 KiB, usam `font-display:swap`, têm preload no HTML e entram no precache do PWA. Uma falha das fontes preserva a interface pelo fallback. Para trocar arquivos, use novos nomes versionados e atualize juntos HTML, CSS, precache e geração do SW. Não sobrescrever um arquivo imutável com outra versão.
