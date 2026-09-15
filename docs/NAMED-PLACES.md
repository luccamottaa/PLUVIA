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

Cada registro leva `updatedAt`. Ao salvar numa conta, o PLUVIA lê a lista remota,
une por id (o apelido mais recente prevalece) e só então grava. Remoções viram
túmulos por 30 dias para não ressuscitar num segundo aparelho. Não há sync ao vivo.

## Limitações
Sem alertas por apelido e sem resolução de conflito campo a campo além de
`updatedAt`. Nenhuma migration e nenhuma consulta meteorológica adicional.
Teste visual em iPhone e autenticação real em dois dispositivos ainda recomendados.
Os testes automatizados verificam normalização, limite, merge e contratos,
não substituem validação end-to-end ou visual.
