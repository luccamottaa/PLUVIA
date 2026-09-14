# Meus locais

Apelidos de cidades brasileiras dentro do seletor: criar, abrir, renomear e remover
até 20 registros. A previsão continua municipal. Casa e Faculdade em Manaus
compartilham os mesmos dados, sem alegação hiperlocal.

Visitantes: localStorage pluvia-named-places-guest-v1.
Contas: user_metadata.named_places_v1 via Supabase Auth autenticado.
Não persistimos endereço, coordenadas ou histórico GPS. Apelidos são texto livre:
a interface pede que o usuário não inclua endereço completo.
Visitantes não são importados automaticamente e dados de conta não são copiados
para o armazenamento de visitante. Nomes usam textContent.

## Limitações
A última lista salva prevalece: edições simultâneas entre dispositivos podem
sobrescrever alterações. Sem sincronização em tempo real e sem alertas por apelido.
Nenhuma migration e nenhuma consulta meteorológica adicional.
Teste visual em iPhone e autenticação real em dois dispositivos pendentes.
Os testes automatizados verificam normalização, limite, renomeação e contratos,
não substituem validação end-to-end ou visual.
