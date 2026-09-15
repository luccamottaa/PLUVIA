# Checklist iOS — depois de cada release do shell

Rodar no iPhone físico, PWA pela Tela de Início, antes de considerar o merge fechado.

1. Instalar: Compartilhar → Adicionar à Tela de Início. Ícone branco com marca azul, sem letra cortada.
2. Abrir pelo ícone (standalone). Barra de status translúcida; conteúdo não invade o notch.
3. Home: se já entrou nessa cidade, a temperatura aparece na hora (leitura salva) e o status vira “Atualizando…”.
4. Sem rede: a última leitura permanece; não some o hero. Toast só se não houver nada salvo.
5. Busca: teclado não empurra o campo para baixo do teclado; Escape/fechar funciona.
6. Sinal: com INMET fora, o card é cinza “Monitoramento incompleto”, não amarelo “Fica atento”.
7. Conta → Notificações: o diagnóstico pede PWA instalada; Ativar alertas só depois do gesto.
8. Push de teste: banner do sistema; o toque reabre o PLUVIA.
9. Meus locais: criar Casa, abrir em outro aparelho logado, criar Faculdade; os dois permanecem.
10. Confirmar que o endereço da PWA é `pluviaweather.com.br`, não `github.io`.

Automatizado: `node --test tests/*.test.cjs` — versões HTML/SW, meta iOS, merge de locais, sinal degradado.
