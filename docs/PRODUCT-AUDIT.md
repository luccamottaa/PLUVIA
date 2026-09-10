# Auditoria de produto — 10/09/2026

Escopo observado no site publicado: abertura, home carregada, conta e busca. A captura foi feita em navegador desktop; teclado, permissões e top layer nativos do iOS não foram reproduzidos.

## Resultado por etapa

1. **Abertura — saudável com ressalva.** A introdução comunica a marca e desaparece; Manaus entra como referência sem bloquear a home. A splash ocupa toda a primeira tela por alguns segundos, então deve continuar limitada a uma vez por sessão e respeitar movimento reduzido.
2. **Clima atual — saudável.** Cidade, temperatura, sensação e leitura rápida dominam a primeira tela. O texto deixa claro que o dado representa o ponto do município. No desktop, o bloco de qualidade do ar trunca a orientação visualmente; a versão mobile precisa de conferência em aparelho.
3. **Busca — estrutura saudável.** A lupa mostra a cidade atual. Ao abrir, o foco permanece no botão de fechar (`closeCitySearch`), comprovando que o campo não recebe foco automático. Capitais aparecem imediatamente e o índice municipal carrega sob demanda. O teclado do iPhone ainda precisa de teste real.
4. **Conta — estrutura saudável.** Entrar e criar conta compartilham um diálogo curto; a conta é opcional e a sessão é restaurada pelo Supabase. O navegador de auditoria expôs a árvore acessível, mas não capturou visualmente a top layer do diálogo; alinhamento e teclado precisam de teste em aparelho.
5. **Alertas e riscos — saudável com abrangência limitada.** INMET diferencia sucesso, falha e leitura antiga. Defesa Civil municipal só tem integração estruturada em Manaus. O índice evita declarar risco baixo quando fontes essenciais estão incompletas.
6. **Previsão e chuva — saudável.** A leitura rápida, janela seca, gráfico horário e previsão diária respondem às perguntas principais. O “Mapa ao redor” é precipitação modelada em nove pontos, identificado corretamente como modelo e não radar.

## Prioridades abertas

- LUC-6: proteção contra senhas vazadas no Supabase.
- LUC-9: validação mobile de busca, localização e conta.
- LUC-5: ativação e verificação do Amplitude.
- LUC-8: ícones e instalação PWA.
- LUC-7: arquitetura do próximo mapa atrás da flag `pluvia-next-rain-map`.

## Limites da auditoria

Não houve login com credencial real nem aceite de permissão de localização. O Mobbin não retornou referências porque a conexão exige plano pago. Figma não foi usado porque esta rodada não propôs uma mudança grande de interface. A captura visual não comprova conformidade completa de acessibilidade.
