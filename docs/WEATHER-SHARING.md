# Compartilhar clima

O botão **Compartilhar** no card principal abre um cartão PNG de 1080 × 1350 e ações para compartilhar pelo sistema, salvar a imagem, copiar texto e abrir o WhatsApp com texto preparado. Nenhuma ação envia uma mensagem automaticamente.

## Dados e integração

- O módulo reutiliza o snapshot da camada meteorológica; não consulta novas APIs.
- A condição atual é identificada como estimativa de modelo. Máxima, mínima e probabilidade de chuva referem-se ao dia da leitura e são previsões.
- Cidade, unidades, data, horário local e fonte acompanham imagem e texto.
- Campos ausentes ficam indisponíveis na imagem e são omitidos do texto; sem temperatura não há compartilhamento meteorológico.
- Dados de cache, consulta sem confirmação e leituras com mais de 30 minutos são identificados como salvos ou desatualizados.
- Trocar a cidade ou atualizar os dados fecha o cartão e descarta gerações pendentes.
- A imagem fica pronta antes do clique que chama a Web Share API. Sem suporte a arquivos, compartilha texto; sem suporte nativo, continuam disponíveis WhatsApp, cópia e download.
- Cancelar o compartilhamento não dispara outra ação. URLs de imagens temporárias são liberadas ao fechar.
- O link usa somente o identificador municipal: `https://pluviaweather.com.br/?city=1302603`. A abertura resolve esse identificador no catálogo existente e respeita escolhas manuais posteriores. Coordenadas do aparelho não são compartilhadas.
- O diálogo reutiliza scrolling, safe areas e VisualViewport dos diálogos existentes. Os assets estão versionados no HTML e no service worker.

## Validação

`node --test tests/weather-share.test.cjs` cobre conteúdo, fusos, ausência parcial/total, cache, capabilities, cancelamento, geração concorrente e links.

A verificação de navegador deve cobrir Manaus, Curitiba, GPS → cidade pesquisada, download PNG, ações de texto, telas pequenas e retorno sem dados. O compartilhamento real pela folha do sistema deve ser conferido em um aparelho; mocks de navegador validam apenas o payload e o fluxo.
