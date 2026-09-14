# Sincronização de preferências — core-58

Os favoritos já são sincronizados por user_metadata do Supabase Auth.
A fila anterior cancelava patches independentes: favoritar e trocar cidade dentro
de 450 ms descartava o primeiro patch. A fila agora combina os campos, com o
último valor de cada campo prevalecendo. Ao mudar de conta ou sair, a fila
pendente é cancelada. Isso não implementa locais personalizados ou resolução
completa de conflitos entre dispositivos.

Testes adicionados para patches combinados e cancelamento ao sair.
Workflow de validação em pull_request adicionado para sintaxe e suíte existente.
Validação visual/mobile não realizada nesta rodada: ambiente de navegador indisponível.
Proteção contra senhas vazadas ainda requer configuração no painel do Supabase;
o conector disponível não oferece alteração dessa configuração.
