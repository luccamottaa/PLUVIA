# Fontes locais do PLUVIA

Obtidas em 2026-10-04 pela API CSS oficial do Google Fonts, sem alterar os arquivos WOFF2 recebidos.

- `inter-latin-v20.woff2`: Inter, normal, eixo de peso 100–900, subconjunto Latin (48.256 bytes). Inclui os caracteres portugueses usuais. CSS de origem: <https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap>. Projeto: <https://github.com/rsms/inter>. Licença: `INTER-OFL.txt` (SIL OFL 1.1).
- `nunito-wordmark-v32.woff2`: Nunito, normal, peso 900, somente os caracteres de **PLUVIA** (1.128 bytes), preservando a assinatura existente. CSS de origem: <https://fonts.googleapis.com/css2?family=Nunito:wght@900&display=swap&text=PLUVIA>. Projeto: <https://github.com/googlefonts/nunito>. Licença: `NUNITO-OFL.txt` (SIL OFL 1.1).

`dist/fonts.css` declara os intervalos Unicode fornecidos pela origem. O texto da aplicação usa Inter e fallback do sistema; somente as assinaturas da intro, cabeçalho e rodapé usam Nunito. Outros alfabetos usam o fallback do dispositivo. Não usar o subconjunto da marca em frases ou nomes pessoais.

As fontes somam menos de 49 KiB, usam `font-display:swap`, têm preload no HTML e entram no precache do PWA. Uma falha das fontes preserva a interface pelo fallback. Para trocar arquivos, use novos nomes versionados e atualize juntos HTML, CSS, precache e geração do SW. Não sobrescrever um arquivo imutável com outra versão.
