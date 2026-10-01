# Meus locais

Apelidos de cidades brasileiras dentro do seletor: criar, abrir, renomear e remover
até 20 registros. A previsão continua municipal. Casa e Faculdade em Manaus
compartilham os mesmos dados, sem alegação hiperlocal.

Visitantes: localStorage pluvia-named-places-guest-v1.
Contas: user_metadata.named_places_v1 via Supabase Auth autenticado.
Não persistimos endereço, coordenadas ou histórico GPS. Apelidos são texto livre:
a interface pede que o usuário não inclua endereço completo.
Ao abrir uma cidade do interior, o catálogo estadual correspondente é carregado
sob demanda antes da troca de previsão.
Visitantes não são importados automaticamente e dados de conta não são copiados
para o armazenamento de visitante. Nomes usam textContent.

Cada registro leva `updatedAt`. Contas enviam operações por ID para
`account-preferences`, que verifica a identidade e grava com compare-and-swap.
Uma edição conserva a versão vista ao começar; se outro dispositivo alterou o
mesmo local, o usuário recebe a lista atual e precisa revisar a alteração.
Exclusões deixam até 20 tombstones no servidor. Edições antigas não recriam um
ID excluído enquanto o tombstone existe; versões antigas também não correspondem
a um ID ausente. Não há sincronização em tempo real.

## Limitações
Sem alertas por apelido nem previsão hiperlocal. Locais exigem confirmação do
servidor, sem fila offline própria. Clientes antigos do PWA ainda podem gravar
arrays completos. Veja [Sincronização da conta](ACCOUNT-SYNCHRONIZATION.md) para
contrato, migration, testes e compatibilidade. Teste com autenticação real em dois
dispositivos e Safari em iPhone físico continua recomendado.
