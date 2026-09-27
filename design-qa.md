# Painel Noturno — verificação visual

- Source visual truth: `/workspace/scratch/8e855cf86be8/generated_images/exec-bfb2d3fd-044a-418a-8f99-65336c739470.png` (853 × 1850 px, mock @2x).
- Implementação: `http://terminal.local:4173/`, capturada e comparada lado a lado em `http://terminal.local:4173/design-review.html` (aba 5 do navegador cloud). A captura renderizada está nessa vista de comparação; a API do navegador não fornece um caminho de arquivo local.
- Viewport de comparação: 426 CSS px de conteúdo, screenshot de implementação no iframe escuro (`color-scheme: dark`); mock exibido a 426 px, aproximadamente metade da resolução original. O iframe tem 441 px externos para compensar sua barra vertical de 15 px. `scrollWidth = clientWidth = 426`, sem corte horizontal.
- Estado: Manaus, sábado à noite, sem diálogo. O mock tem dados ilustrativos de 20:11, 30° e parcialmente nublado; a implementação lê dados atuais (20:33, 28°, céu encoberto). Essas diferenças de conteúdo e de ícone são intencionais.

## Comparação

- Tipografia: Nunito arredondada, título da cidade, temperatura, descrição e labels preservam a hierarquia do mock. A temperatura foi ampliada após a primeira captura.
- Espaçamento: logo e busca separados, cidade/condição em área livre, cinco horas visíveis na largura de 426 px e métricas em faixa de três colunas. O scroll horizontal da faixa não aparece visualmente; permanece funcional em larguras menores.
- Cores: céu azul-escuro gerado como asset, painéis azul translúcido, borda fria e texto claro. O modo claro continua off-white por preferência anterior do produto.
- Imagem: asset atmosférico específico em WebP (863 × 1823 px, 28 KB); a condição é representada pelo ícone meteorológico real do PLUVIA, sem fixar a lua do mock quando o céu muda.
- Conteúdo: a linha de status e o link da previsão são informações reais do produto; sensação, máximas e mínimas respondem à cidade escolhida.

## Histórico de correções

1. Primeira comparação: busca mostrava só a lupa, cinco horas estouravam a largura e a faixa térmica ficava em cards separados. Corrigidos o rótulo da cidade, grade de cinco colunas, scrollbar visual e faixa unificada.
2. Segunda comparação: título/temperatura menores que o mock. A temperatura e a descrição foram ampliadas. Nova captura em 426 px confirmou composição e ausência de overflow.
3. Troca Manaus → Recife → Manaus verificada; o resumo por hora acompanha os novos dados. O estado transitório que mostrava dados horários da cidade anterior foi limpo.

## Interações e regressões

- Busca, seleção de Recife e Manaus, atualização da previsão e atalho para a previsão detalhada testados no navegador.
- Console da página sem erro da aplicação; erros observados vieram da extensão do navegador cloud.
- `node --test tests/*.test.cjs`: 86 testes aprovados, zero falhas.
- Captura renderizada em navegador e comparação lado a lado na aba 5. Também conferidas duas capturas em `http://terminal.local:4173/qa-mobile.html` (aba 6): 320 CSS px escuro e 390 CSS px claro. Em ambas, `scrollWidth = clientWidth`; no claro o fundo computado é `rgb(246, 243, 237)`.
- Console: apenas falha de metadados da extensão do navegador cloud, sem erro da aplicação. A versão integrada à base atual passou novamente em 86 testes.

**Findings**

- Nenhum P0/P1/P2 visual remanescente observado na comparação de 426 px. O conteúdo meteorológico difere por ser dinâmico.

**Open Questions**

- A verificação em aparelho físico continua útil para avaliar o reflexo ao toque e as áreas seguras específicas do iPhone; não foi possível reproduzir o hardware neste navegador.

**Implementation Checklist**

- Checagem visual e funcional concluída; publicar a versão integrada e confirmar a página no domínio.

**Follow-up Polish**

- P3: reavaliar a linha de status acima do horário se o topo parecer carregado no iPhone.

final result: passed
