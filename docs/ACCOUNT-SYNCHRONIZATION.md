# Evolução: sincronização da conta

## Inventário e prioridade

Favoritos, cidade principal, Supabase Auth, nome do perfil e locais com apelidos já existiam. A etapa anterior estabilizou a paginação do worker push. O catálogo municipal, previsão, timeline/gráficos, interpretação determinística, UV/vento/chuva, AQI, atmosfera/astronomia, radar, cache offline, compartilhamento e PWA também têm implementações existentes: veja o inventário dos 38 pedidos em `PRODUCT-EVOLUTION.md`. Não foram duplicados nem substituídas APIs nesta etapa.

A prioridade escolhida foi perda de preferências entre dispositivos. O fluxo antigo lia metadata, unia arrays e chamava `Auth.updateUser`. Duas escritas simultâneas podiam perder favoritos/locais; união de favoritos também podia reintroduzir remoções. Uma resposta tardia podia pintar outra conta. Resolver a fonte dessas inconsistências traz benefício sem mudar a interface nem criar novas consultas meteorológicas.

## Contrato implementado

- `account-preferences` exige Auth válido e `ownerId` igual ao usuário verificado. Leitura devolve snapshot normalizado; escrita aceita somente operações validadas.
- `auth.users.raw_user_meta_data` conserva os dados existentes. Migration cria somente `pluvia_account_patch(uuid,jsonb,jsonb)`: comparação atômica do JSON esperado, patch de campos permitidos, `security definer`, `search_path` vazio e execução exclusiva de service_role. Não há tabela nova nem migração de listas pessoais.
- Em disputa, o servidor relê o usuário e rebaseia a operação, com até três tentativas. Alterações independentes em favoritos/locais preservam os demais campos. Favoritos são add/remove por cidade; 30 é o limite existente.
- Locais usam ID, versão esperada e campos municipais existentes. Versão é gerada no servidor. Alteração concorrente do mesmo local exige revisão. O formulário captura a versão ao começar a edição, inclusive se chegar um refresh depois. Limite 20 ativos/20 tombstones. Repetir uma operação já refletida é idempotente. Remoção vence empate no merge legado/visitante.
- Nome passa pelo mesmo endpoint; cidade principal/nome usam a última operação aplicada. Não se promete resolução de conflito campo a campo para esses valores escalares. Signup mantém nome inicial em Auth.
- O cliente serializa operações e deduplica leituras. Abort/revisão de conta bloqueia respostas antigas, inclusive A → B → A. Snapshot recebido prevalece sobre metadata antiga em memória do SDK.
- Favoritos/cidade principal têm fila local por usuário, preservada no reload inclusive com request em voo. Operações mais recentes prevalecem na fila. Falhas transitórias aguardam reconexão/novo evento, sem loop de retry. Fila é limitada a 600 mudanças; requests enviam até 60. O dispositivo não guarda nomes de locais, endereço ou GPS nessa fila.
- Revalidação acontece no acesso, reconexão e retorno ao app (freshness 30 segundos), sem polling novo. Locais/nome exigem confirmação online. Texto em edição sobrevive à revalidação; troca de conta limpa campos pessoais.

## Segurança e publicação

Nenhum secret foi movido ao frontend. Chave publicável continua pública; service_role fica na função. Metadata nunca autoriza acesso. Logs contêm apenas código genérico, sem identidade/coordenadas/nomes. RPC não é acessível diretamente por usuários. Requests administrativos têm timeout de oito segundos e invoke frontend de quinze segundos; corpo usa o limite HTTP compartilhado.

Aplicar a migration e publicar a função com `verify_jwt=true` antes do Pages. HTML/PRECACHE referenciam o novo transporte e versões novas da conta/locais; SW usa geração 48. Demais funções não precisam de redeploy. Não são feitos envios push nem alterações persistentes em usuários para QA.

## Verificação desta etapa

- Suíte Node: 64 arquivos passam; execução sem isolamento registra 246 entradas, zero falhas/skips. São 22 entradas a mais que a etapa anterior, incluindo arquivos de assertions diretas; não são 246 testes novos.
- Sintaxe dos 36 JS/CJS publicados e typecheck Deno das sete funções passaram.
- Migration e verificações CAS/allowlist/permissões/nome passaram em transação revertida; nenhum usuário foi modificado permanentemente.
- Chromium e WebKit passaram com dois dispositivos simulados: favoritos independentes, locais novos, conflito após refresh, nome canônico apesar do SDK antigo e replay offline após reload; sem erros de JavaScript.
- QA público WebKit passou em sete viewports (320–2560 px), sete estados visuais, detalhes, favoritos, compartilhamento, status stale e troca de cidade offline, sem overflow/erros.
- Diff revisado e `git diff --check` passou. O único warning de teste é a API experimental Node `stripTypeScriptTypes`, usada somente para executar o handler TypeScript na VM; o typecheck Deno independente passou.

 A suíte inclui regras do serviço, limites/entrada inválida, CAS com rebase, conflito no mesmo ID, identidade incorreta/anonimato, retry limitado, cancelamento, remoções, outbox e campo focado em troca de conta. SQL verificável com rollback preserva dados e verifica rejeição de overwrite, allowlist, nome e grants. QA em dois contextos de navegador usa SDK real com sessões fictícias e intercepta serviços; não é login real de produção.

Não há lint, typecheck frontend ou build de compilação configurados. O typecheck disponível é Deno das funções; produção publica `dist/` estático após os testes.

## Limites e próximos passos

Clientes antigos ainda podem gravar arrays completos via Auth e sobrescrever listas. A atualização do SW ajuda a distribuir o novo cliente, mas não força todas as instalações a atualizar instantaneamente. Auth metadata permanece editável pelo dono; o CAS não bloqueia esses writers legados. Avaliar uma tabela dedicada com RLS/compatibilidade somente se houver necessidade real de eliminar essa limitação.

Não há sync em tempo real, fila offline para nomes/locais nem garantia exactly-once para criação antiga após descarte de tombstones. Os 20 tombstones têm retenção limitada por quantidade. Abortar um request não desfaz uma operação já aceita pelo servidor; as operações por item toleram repetição do resultado conhecido.

Autenticação real em dois dispositivos e Safari em iPhone físico continuam pendentes; não foram acessadas contas pessoais para simulá-los. O aviso preexistente de proteção contra senhas vazadas depende de plano Pro ou superior; não foi contratado upgrade. Nowcast com ETA em minutos e raios observados continuam dependendo de dados/cobertura/licença apropriados; nada foi inventado.

Próxima prioridade sugerida: medir atraso do processamento push e melhorar a janela do resumo diário/falhas transitórias de entrega. O cursor justo já publicado não oferece latência constante em filas grandes, e ainda não existe fila dedicada de retries de entrega. Implementar com métricas/regras de deduplicação antes de aumentar funcionalidades visuais.
