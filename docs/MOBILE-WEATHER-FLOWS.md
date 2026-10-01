# Busca, previsão, radar e favoritos

A busca mantém o campo fora da lista rolável e acompanha altura e deslocamento do viewport visível do teclado. A troca automática de versão da PWA aguarda o fechamento de diálogos e o fim da edição de campos. A validação física no iPhone continua necessária.

A previsão por hora mostra temperatura, chance e volume de chuva juntos. O resumo de 12 horas agrupa o intervalo de probabilidades próximas do pico; dados ausentes não são tratados como tempo seco. O volume de 12 horas só aparece se todas as horas tiverem volume conhecido.

“Ampliar radar” abre o mapa e o player existentes em um diálogo que ocupa a tela. Fechar restaura o mesmo mapa e pausa a animação. Escape, foco, rotação e safe areas são tratados sem depender da Fullscreen API do Safari.

As cidades favoritas aparecem na página e na busca, com temperatura, condição e chance máxima de chuva nas próximas três horas. Resumos usam requisições leves de Open-Meteo, duas em paralelo, carregadas quando o cartão fica visível, e cache local de 20 minutos. Leituras antigas são identificadas e mantidas por até 36 horas para uso offline. A sincronização dos IDs pela conta é preservada; favoritar não ativa notificações.

Validação automatizada: resumo com dados ausentes e mudança de dia; cache dos favoritos; preservação do mapa ao ampliar e fechar; recarga da PWA durante busca; reunião de eventos e deduplicação por cidade, dispositivo e severidade.
