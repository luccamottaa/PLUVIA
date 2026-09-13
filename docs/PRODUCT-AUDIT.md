# Auditoria de produto — 10/09/2026

## Rodada pós-produção — 13/09/2026

### Diagnóstico classificado

- **P0:** nenhum defeito crítico confirmado no código, na suíte ou na abertura pública. Não foi encontrada chave `service_role`; a chave do navegador é publishable. O schema `public` do Supabase não possui tabelas expostas.
- **P1:** primeira visita pode permanecer cerca de 10–12 segundos em placeholders quando o Open-Meteo responde lentamente; proteção contra senhas vazadas está desativada no Supabase; o domínio público depende do GitHub Pages e não oferece no repositório controle direto dos headers de segurança; PLUVIA Sinal anterior estava duplicado em dois cards e sem contrato único de explicação/confiança.
- **P2:** SEO possui apenas a raiz no sitemap e não há páginas server-side por cidade; cache meteorológico anterior aceitava até sete dias para condição atual; falha do ar podia apagar a última leitura válida; retry da previsão repetia também respostas permanentes; instalação PWA não tinha ícones 192/512 dedicados.
- **P3:** notificações push, deduplicação persistente, fusão multifuente, ETA de chuva e páginas municipais em escala dependem de uma etapa arquitetural própria e de fontes/licenças ainda não validadas.

### Evidências de produção

- A home pública carregou Manaus, temperatura, previsão e AQI sem erro de JavaScript da aplicação.
- Em primeira visita, os dados do Open-Meteo apareceram após a espera inicial; clima e ar responderam HTTP 200 no teste externo.
- O endpoint ativo do INMET respondeu HTTP 502 durante a auditoria. A interface isolou a falha e manteve clima e ar funcionando, sem chamar modelo de alerta oficial.
- O domínio `pluviaweather.com.br` respondeu HTTP 200 via GitHub Pages, com cache de 10 minutos.
- Busca, navegação sem login, diálogos e estrutura acessível foram inspecionados no navegador. Permissão real de GPS, teclado do iPhone, VoiceOver/TalkBack e login com credencial não foram executados nesta rodada.

### Correções preparadas nesta fase

- Contrato determinístico do PLUVIA Sinal com quatro estados, fatores e confiança.
- Sinal movido para a área de decisão imediata da tela Agora.
- Cache meteorológico limitado a 36 horas e horário do dado visível.
- AQI degrada de forma independente e preserva leitura anterior somente com aviso explícito.
- Retry restrito a timeout, rede, 408/425/429/5xx ou resposta inválida.
- Skeleton discreto preservando o layout na primeira carga e `aria-busy` durante atualização.
- Ícones PWA 192, 512 e maskable dedicados.
- Nova cobertura automatizada das regras do PLUVIA Sinal.

### Riscos que permanecem

- A primeira visita continua limitada pela latência da fonte porque a arquitetura atual é totalmente estática; SSR/edge cache exige migrar somente a camada de dados, sem reescrever a interface.
- A proteção contra senhas vazadas precisa ser habilitada nas configurações do Auth e pode depender do plano do Supabase.
- Headers como CSP/HSTS/Permissions-Policy precisam ser configurados na camada de hospedagem; meta tags não substituem headers HTTP.
- Páginas SEO por cidade exigem geração estática controlada ou backend/edge com cache e conteúdo útil no HTML inicial.

---

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
