// Versões do PLUVIA para as pessoas: 1.1, 1.2… trazem novidades; 1.1.1, 1.1.2… só correções.
// A lista é escrita à mão a cada publicação que muda algo visível (a mais nova primeiro).
// Depois de uma versão de novidades, quem já usava vê uma vez a janela "O PLUVIA 1.x chegou".
// Correções não avisam: ficam só na lista. Primeiro acesso não avisa nada.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.changelog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (runtime) {
  "use strict";
  const SEEN_KEY = "pluvia-seen-version";
  const WAIT_MS = 20000, SETTLE_MS = 900;
  const VERSIONS = [
    {version:"1.41.3", date:"2026-10-28", title:"Azul mais vivo", items:[
      "O azul dos destaques (Hoje, chance de chuva, atalhos, ícones e links) ficou mais forte e nítido, de dia e de noite.",
      "O fundo atrás da pílula do topo some aos poucos, sem a borda reta de antes.",
      "Segurar o dedo na tela sem querer não seleciona mais o texto nem abre o menu de copiar."
    ]},
    {version:"1.41.2", date:"2026-10-28", title:"Ícone na pílula do iPhone", items:[
      "O ícone do tempo agora aparece na pílula do topo também no iPhone."
    ]},
    {version:"1.41.1", date:"2026-10-28", title:"Pílula mais nítida", items:[
      "A pílula do topo desceu um pouco e não fica mais borrada embaixo do relógio do iPhone."
    ]},
    {version:"1.41", date:"2026-10-28", title:"Cabeçalho novo ao rolar", items:[
      "Ao descer a tela, a cidade e a temperatura ficam numa pílula no topo, com o ícone do tempo de agora."
    ]},
    {version:"1.40.1", date:"2026-10-28", title:"Nuvens 3D mais firmes", items:[
      "As gotas de chuva na tela saíram.",
      "As nuvens 3D não se desligam mais à toa: o app tenta de novo com menos detalhe antes de voltar às nuvens comuns.",
      "Saiu o brilho branco em volta da Lua; fica só a luz no centro dela."
    ]},
    {version:"1.40", date:"2026-10-28", title:"PLUVIA na tela de início", items:[
      "No navegador do celular, um convite embaixo da tela mostra como colocar o PLUVIA na tela de início: abre direto na sua cidade, funciona sem internet e avisa quando vai chover.",
      "Os botões de informação (o “i” ao lado dos títulos) ganharam um ícone novo, no azul do PLUVIA.",
      "A Lua no céu brilha mais: a luz fica no centro do disco, como se ela estivesse acesa, mais forte na lua cheia."
    ]},
    {version:"1.39.2", date:"2026-10-28", title:"Intro e cabeçalho ajustados", items:[
      "Com neblina, a abertura não deixa mais a página aparecer por trás do PLUVIA.",
      "O cabeçalho que aparece ao rolar desceu um pouco, longe do relógio e da Dynamic Island do iPhone.",
      "A qualidade do ar ficou mais enxuta: saíram os próximos dias e a lista de poluentes."
    ]},
    {version:"1.39.1", date:"2026-10-28", title:"Cartões inteiros ao rolar", items:[
      "Os títulos dos cartões não ficam mais grudados no topo nem o conteúdo cortado embaixo deles: ao rolar, os cartões somem suavemente sob o cabeçalho.",
      "De dia, o nome da cidade e a temperatura no cabeçalho ficam escuros no céu claro, como o resto do topo, em vez de brancos quase sumindo."
    ]},
    {version:"1.39", date:"2026-10-28", title:"Cabeçalho que acompanha a rolagem", items:[
      "Ao rolar a página, o nome da cidade, a temperatura e a condição ficam no topo, e o conteúdo some por baixo deles, sem passar por trás do relógio do celular.",
      "Os cartões entram embaixo do cabeçalho: vão sendo cortados com a borda redonda, e o título de cada um (Próximas horas, 7 dias, dicas, avisos, cada bloco de leitura, radar e Ciclo do dia) fica grudado até ele sumir.",
      "O Sol e a Lua esmaecem quando você rola, para não ficarem por cima dos textos."
    ]},
    {version:"1.38.1", date:"2026-10-28", title:"Céu fixo na tela", items:[
      "O céu agora fica parado atrás de tudo: nuvens, Sol, Lua, gotas e as cores do pôr e do nascer do sol não rolam mais junto com a página."
    ]},
    {version:"1.38", date:"2026-10-27", title:"Gotas de chuva na tela", items:[
      "Quando chove, gotinhas aparecem na tela como num vidro: pousam, crescem, secam e algumas escorrem. Quanto mais forte a chuva, mais gotas.",
      "Depois do pôr do sol o céu vai escurecendo aos poucos durante o crepúsculo até virar noite, e de manhã clareia do mesmo jeito, sem troca de uma vez."]},
    {version:"1.37.3", date:"2026-10-27", title:"Menos garoa que não existe, em todas as cidades", items:[
      "Quando a previsão fala em garoa ou chuva fraca, mas ela mesma prevê pouquíssima chuva e chance baixa para a hora, o topo mostra o céu como está (nublado, parcial ou poucas nuvens). Se a estação, o aeroporto ou o radar virem chuva, ela continua aparecendo."]},
    {version:"1.37.2", date:"2026-10-27", title:"Ícones nos títulos", items:[
      "“Chuva na região” e “Ciclo do dia” ganharam ícones, no mesmo estilo dos outros blocos.",
      "O botão de informação da Qualidade do ar fica ao lado do título, como nas outras seções."]},
    {version:"1.37.1", date:"2026-10-27", title:"Sol e Lua sem teletransporte", items:[
      "Ao voltar para o app depois de um tempo, o Sol e a Lua deslizam até onde estão agora no céu, em vez de pular de lugar. Com o app aberto eles continuam andando sozinhos, na velocidade real."]},
    {version:"1.37", date:"2026-10-27", title:"Quanto o PLUVIA acerta", items:[
      "Novo atalho no fim dos 7 dias: veja quantas chuvas o PLUVIA avisou e quantas vezes o “vai chover” deu certo, comparando com a estação do INMET nas próximas 3 e 12 horas.",
      "Mostra os dois lados, os acertos e os alarmes que não deram em nada. Por enquanto a medição é feita nas capitais."]},
    {version:"1.36", date:"2026-10-27", title:"Raio dentro das nuvens, arco-íris e estrela cadente", items:[
      "Na trovoada, as nuvens em 3D se acendem por dentro em volta do raio, como numa tempestade de verdade.",
      "Com chuva fraca ou garoa e o Sol baixo, aparece um arco-íris do lado oposto ao Sol, onde ele estaria no céu.",
      "Nas noites de pico de uma chuva de meteoros visível da sua cidade, com o céu limpo, passa uma estrela cadente de vez em quando.",
      "A neblina ganhou uma névoa em 3D, densa perto do chão e sumindo para cima."]},
    {version:"1.35.2", date:"2026-10-27", title:"Garoa que não existe some do topo", items:[
      "Quando o radar não vê chuva em cima da cidade e a estação do INMET ou o aeroporto confirmam tempo seco, o PLUVIA deixa de mostrar a garoa ou chuva fraca da previsão e mostra o céu como está."]},
    {version:"1.35.1", date:"2026-10-27", title:"Nuvens se formando no céu todo", items:[
      "As nuvens em 3D agora se formam e se desfazem em qualquer parte do céu, em vez de só entrarem pelo lado direito."]},
    {version:"1.35", date:"2026-10-27", title:"Nuvens em 3D em todos os céus, no pôr do sol e na abertura", items:[
      "As nuvens em 3D agora aparecem em todo céu com nuvem, de dia e de noite: poucas nuvens, parcial, nublado, chuva e trovoada.",
      "No pôr e no nascer do sol, a luz baixa pinta as nuvens de laranja e rosa por baixo.",
      "A luz vem de cima: o topo das nuvens fica claro e a base mais cinza.",
      "A Lua e o Sol passam por trás das nuvens, sem atravessar a parte mais densa.",
      "A abertura do app já mostra as nuvens em 3D."]},
    {version:"1.34", date:"2026-10-27", title:"Nuvens em 3D de dia, com o brilho do Sol", items:[
      "De dia, com poucas nuvens ou parcialmente nublado, as nuvens também são em 3D, macias e com sombra embaixo.",
      "Quando o Sol passa atrás de uma nuvem, a borda dela se acende e o brilho atravessa a parte mais fina, como na vida real."]},
    {version:"1.33", date:"2026-10-27", title:"Nuvens em 3D à noite", items:[
      "À noite, no céu nublado, com chuva ou com trovoada, as nuvens agora são desenhadas em 3D em tempo real: macias, com o topo iluminado pela Lua e a base na sombra, maiores na chuva e na trovoada, mudando de forma devagar com o vento.",
      "Em aparelhos sem suporte, com movimento reduzido ou que fiquem lentos, o PLUVIA volta sozinho às nuvens de antes."]},
    {version:"1.32.1", date:"2026-10-27", title:"Nuvens da noite como antes", items:[
      "As nuvens com volume da noite saíram: o céu nublado, de chuva e de trovoada à noite voltou ao visual anterior. Os raios continuam acendendo as nuvens por dentro.",
      "O céu nublado da noite ficou num azul mais escuro."]},
    {version:"1.32", date:"2026-10-27", title:"Nuvens com volume e raios dentro das nuvens", items:[
      "À noite, o céu nublado, de chuva e de trovoada ganhou nuvens com volume: cúmulos com o topo iluminado e a base na sombra, como no app Tempo, no lugar das manchas chapadas.",
      "Nas trovoadas, o raio passa por trás das nuvens da frente e o clarão acende as nuvens por dentro, sem clarear o céu todo."]},
    {version:"1.31", date:"2026-10-27", title:"Chuva com vento, prévia dos avisos e story com nuvens", items:[
      "Com vento forte, a chuva do céu cai mais inclinada.",
      "Quando o radar vê chuva chegando, o PLUVIA oferece os avisos no celular, e o convite mostra um exemplo de como o aviso chega.",
      "Segurando o ícone do app no Android, há um atalho novo: Vai chover?",
      "A imagem para compartilhar no story ganhou as nuvens do céu do app e a cor da condição: cinza na chuva, prata no nublado, e o céu do crepúsculo no pôr e no nascer do sol."]},
    {version:"1.30.1", date:"2026-10-27", title:"Chuva à noite em cinza", items:[
      "Com chuva ou trovoada à noite, o céu e os cartões ficam cinza-chumbo, como no app Tempo, em vez do azul-marinho."]},
    {version:"1.30", date:"2026-10-27", title:"Passe o dedo no gráfico do dia", items:[
      "No detalhe de cada dia, encoste e arraste o dedo no gráfico: uma linha acompanha e mostra a hora, a temperatura e a chuva prevista daquele horário, como no app Tempo."]},
    {version:"1.29.4", date:"2026-10-27", title:"Nuvens de chuva nítidas", items:[
      "As nuvens de chuva e de tempestade e a camada da frente do céu foram redesenhadas com bordas e fiapos mais definidos, iguais às outras nuvens: antes pareciam borradas mesmo com a resolução nova."]},
    {version:"1.29.3", date:"2026-10-27", title:"Nuvens na resolução da tela", items:[
      "Todas as nuvens do céu foram refeitas na resolução da tela do iPhone, pixel por pixel: o parcialmente nublado, a camada da frente de todos os céus e as nuvens de nublado, chuva, tempestade e neblina ficam nítidas, sem borrão."]},
    {version:"1.29.2", date:"2026-10-26", title:"Nuvens do dia a dia em alta resolução", items:[
      "As nuvens do céu parcialmente nublado e a camada da frente de todos os céus com nuvem também ganharam resolução bem maior, então ficam nítidas na tela do celular."]},
    {version:"1.29.1", date:"2026-10-26", title:"Nuvens mais nítidas e com a cor do céu", items:[
      "As nuvens dos céus nublado, de chuva, de tempestade e de neblina foram refeitas em resolução bem maior: no celular elas apareciam esticadas e borradas, e agora ficam macias e definidas.",
      "O céu nublado da noite ficou azul-anil, com nuvens finas e naturais esticadas pelo vento, e no pôr e no nascer do sol elas escurecem e pegam o violeta do céu, como no app Tempo, no lugar da massa cinza-escura ou das nuvens brancas demais."]},
    {version:"1.29", date:"2026-10-26", title:"Gráfico do dia, protetor solar e radar adiante", items:[
      "Ao tocar num dos Próximos 7 dias, o detalhe abre com um gráfico como o do app Tempo: a curva da temperatura hora a hora, colorida do frio ao quente, com a mínima, a máxima e o \"Agora\" marcados, e embaixo as barras da chuva prevista.",
      "O Índice UV agora diz até quando usar protetor solar no resto do dia, como \"Proteção solar até 15:00\".",
      "O radar ampliado mostra também os próximos 30 minutos: a chuva segue andando pelo movimento das últimas imagens, com o horário marcado como \"Previsão para\"."]},
    {version:"1.28", date:"2026-10-26", title:"Nascer e pôr do sol dos próximos dias", items:[
      "Em \"Mais sobre o céu\", uma tabela com o nascer e o pôr do sol dos próximos 14 dias na sua cidade, com quanto tempo de luz cada dia tem e se o Sol vai se pôr mais cedo ou mais tarde na próxima semana."]},
    {version:"1.27.2", date:"2026-10-26", title:"\"Tá chovendo aí?\" no radar e setas suaves", items:[
      "A pergunta \"Tá chovendo aí?\" mudou para o cartão do radar, embaixo do mapa da chuva, e saiu do meio entre as próximas horas e os 7 dias.",
      "As setinhas de \"Mais sobre o céu\", \"Poluentes e origem\" e das opções da conta agora giram suavemente ao abrir e fechar, em vez de trocar de uma vez."]},
    {version:"1.27.1", date:"2026-10-26", title:"Horas e dias no mesmo cartão", items:[
      "Os Próximos 7 dias agora ficam no mesmo cartão das Próximas horas, logo embaixo, como no app Tempo: os botões Condição, Chuva e Vento mudam os dois juntos."]},
    {version:"1.27", date:"2026-10-26", title:"Próximos 7 dias em Chuva e Vento", items:[
      "Os Próximos 7 dias agora seguem o modo das Próximas horas, como no app Tempo: em Chuva, cada dia mostra a chuva hora a hora numa faixa, com o total e a chance; em Vento, a menor e a maior velocidade do dia e a rajada mais forte.",
      "Ao trocar entre Condição, Chuva e Vento, as horas e os dias somem e reaparecem num fade curto, no lugar do efeito de varrer da esquerda.",
      "Os três modos têm a mesma altura: a janela seca e o \"Tá chovendo aí?\" não pulam mais de lugar ao trocar de modo."]},
    {version:"1.26.6", date:"2026-10-26", title:"Abertura no clima certo e troca de modo animada", items:[
      "A abertura agora mostra o mesmo céu que a tela inicial vai mostrar, inclusive a chuva medida agora, em vez do tempo de quando a previsão foi baixada.",
      "Na abertura com céu nublado de dia, o nome PLUVIA fica branco com uma sombra suave, em vez do azul-claro que sumia no céu prateado.",
      "A abertura ganhou o slogan \"O céu do Brasil agora\", com o nome e o slogan alinhados e centralizados; as imagens de prévia dos links (geral e das capitais) também usam o slogan novo.",
      "Ao trocar entre Condição, Chuva e Vento nas Próximas horas, a fileira nova aparece deslizando da esquerda e as barras de chuva sobem, como no app Tempo."]},
    {version:"1.26.5", date:"2026-10-26", title:"Vento e nublado mais bonitos", items:[
      "O modo Vento das Próximas horas ficou como no app Tempo: velocidade grande em cada hora e um gráfico contínuo embaixo, com a linha da velocidade sobre a área das rajadas.",
      "O céu nublado ficou claro e prateado, com nuvens macias, de relevo e fiapos, como no app Tempo, no lugar do cinza-chumbo."]},
    {version:"1.26.4", date:"2026-10-26", title:"Home mais enxuta e correções", items:[
      "Os cartões Medido agora, Nível do rio e Focos de calor saíram da Home. A chuva medida pela estação e pelo aeroporto continua mudando a condição do topo.",
      "Trocar entre Condição, Chuva e Vento enquanto a cidade nova carregava mostrava as horas da cidade anterior; não mostra mais.",
      "\"Usar minha localização\" tenta de novo quando a lista de cidades falha por um instante na rede, em vez de desistir."]},
    {version:"1.26.3", date:"2026-10-26", title:"Chuva cinza", items:[
      "Com chuva forte ou trovoada de dia, o céu agora fica cinza, sem o fundo azul-marinho que aparecia embaixo das nuvens."]},
    {version:"1.26.2", date:"2026-10-26", title:"Nublado de verdade e menos texto no topo", items:[
      "O céu nublado agora tem nuvens cheias, com relevo, de ponta a ponta, como no app Tempo.",
      "A condição de céu fechado passou a se chamar \"Nublado\" (antes aparecia \"Céu encoberto\").",
      "A linha \"INMET · Sem alertas\" saiu da tela: os avisos oficiais só aparecem quando existem."]},
    {version:"1.26.1", date:"2026-10-26", title:"Setas do vento mais claras e abertura rápida", items:[
      "No modo Vento das Próximas horas, cada hora mostra uma seta cheia dentro de um círculo e, embaixo, de onde o vento vem (\"de SE\").",
      "A abertura com a logo agora aparece toda vez que você abre o PLUVIA, na versão rápida, e some assim que a previsão chega."]},
    {version:"1.26", date:"2026-10-26", title:"Logo nova, modos nas Próximas horas e estrelas que piscam", items:[
      "O PLUVIA tem logo nova: a gota com nuvem, sol e onda, em azul e ciano.",
      "Ela aparece na abertura, no rodapé, no ícone da tela inicial, nas abas do navegador, nas prévias de links e na imagem de compartilhar.","Nas noites limpas, as estrelas do fundo deslizam bem devagar e algumas piscam, acendendo e apagando.","Próximas horas ganhou três modos, como no app Tempo: condição, chuva (intensidade e chance) e vento (velocidade e direção).","\"Chuva na próxima hora\" ficou mais clara: cada coluna mostra quanto da cidade tem chuva no radar."]},
    {version:"1.25.5", date:"2026-10-26", title:"Topo alinhado", items:[
      "A condição do tempo (\"Céu limpo\", \"Nublado\"…) ficou mais perto da temperatura, sem aquele vão entre os dois.","O número da temperatura ficou centralizado com a cidade e a condição (antes ficava um pouco para a esquerda).","No detalhe de cada hora, o ícone ficou maior e alinhado com a temperatura, e a nota de chuva não diz mais \"Chuva prevista\" quando a chance é 0%."]},
    {version:"1.25.4", date:"2026-10-21", title:"Visibilidade com número", items:[
      "Quando o aeroporto informa só \"10 km ou mais\", a visibilidade agora mostra a distância prevista pelo modelo (por exemplo, 24 km) em vez de ficar sempre em \"10+ km\". Com o modelo abaixo de 10 km, continua valendo a medida do aeroporto."]},
    {version:"1.25.3", date:"2026-10-21", title:"Próximos 7 dias alinhados", items:[
      "A chance e o volume de chuva ficaram centrados na coluna, e o nome do dia de hoje aparece em azul, de dia e de noite."]},
    {version:"1.25.2", date:"2026-10-21", title:"Correção de bugs", items:[
      "A cidade salva não troca mais por Manaus quando a internet está lenta na abertura.",
      "Os favoritos de uma conta não passam mais para outra conta no mesmo aparelho.",
      "Últimos 30 dias não diz \"nenhum dia com chuva\" quando faltam dados de algum dia.",
      "Brasil agora mostra o horário da atualização no fuso da cidade, e a seta para cima na busca vai ao último resultado."]},
    {version:"1.25.1", date:"2026-10-21", title:"Próximos 7 dias mais legíveis", items:[
      "Os nomes dos dias ficaram maiores, os ícones mais no centro da linha, e o dia de hoje ganhou destaque com cor e fundo próprio.",
    ]},
    {version:"1.25", date:"2026-10-21", title:"Intro nova, céu nublado e mais rápido", items:[
      "A abertura ganhou vida: a gota cai, abre as ondinhas na água e o PLUVIA aparece. Para quem já viu, ela é bem mais curta e some assim que a previsão chega.",
      "Dia nublado agora tem cara de dia nublado: céu cinza-chumbo, texto branco e cartões escuros, como no app Tempo do iPhone. Garoa e chuva fraca também.",
      "Na primeira visita a previsão começa a baixar logo de cara e aparece até quase 1 segundo antes, gastando menos internet.",
      "Mais de 25 correções: busca por “Pé de Serra” e “Sento Sé”, “-0°” no frio, janela seca que dizia “amanhã” para depois de amanhã, avisos de chuva repetidos, resumos que podiam não chegar, botão de avisos que desligava em vez de tentar de novo, radar ilegível no céu cinza e mais.",
    ]},
    {version:"1.24.1", date:"2026-10-20", title:"Correção de bugs e melhoria de desempenho", items:[
      "No Chrome e no Android, o sol e a lua atrás das nuvens apareciam cortados demais nos ícones; agora o recorte fica só em volta da nuvem.",
      "As barras de “Chuva na próxima hora” voltaram a ficar azuis quando há chuva.",
      "Tocar num link logo depois de uma atualização do app não cancela mais a abertura da página.",
      "No “Brasil agora”, a escala de cores não aparece mais sozinha enquanto o mapa carrega ou quando a consulta falha.",
    ]},
    {version:"1.24", date:"2026-10-20", title:"Ícones redesenhados", items:[
      "Os ícones do tempo foram redesenhados com mais cuidado: uma nuvem só, sempre no mesmo lugar, e a chuva centrada embaixo dela.",
      "Sol, lua e nuvens de trás ganharam um recorte fino quando ficam atrás de outra nuvem, como no app Tempo do iPhone.",
      "Neve, granizo, neblina e pancadas de chuva ficaram mais legíveis.",
    ]},
    {version:"1.23.2", date:"2026-10-20", title:"Próximas horas alinhadas", items:[
      "A gota e a chance de chuva ficam centradas embaixo de cada hora, sem invadir a hora ao lado.",
      "A gota ganhou o desenho novo, e o ícone de poucas nuvens ficou centrado como os outros.",
      "Nas dicas, a folha e o sol ficam no meio do texto, não mais grudados na primeira linha.",
      "O topo ficou mais limpo: só cidade, temperatura e condição. “Vai chover?” virou a primeira dica, a barra de chuva e a comparação com ontem foram para o cartão Próximas horas, e sensação e máxima/mínima ficam nos blocos de leitura.",
    ]},
    {version:"1.23.1", date:"2026-10-20", title:"Botões de dia", items:[
      "Os botões do “Tá chovendo aí?” voltaram a parecer botões de dia, com borda e fundo como à noite.",
    ]},
    {version:"1.23", date:"2026-10-20", title:"Cartões de dia", items:[
      "De dia, os cartões trocaram o branco leitoso por um vidro azulado mais transparente, que deixa o céu aparecer.",
      "Tocar num link logo depois de uma atualização do app não volta mais para a mesma página.",
    ]},
    {version:"1.22", date:"2026-10-20", title:"Ícones novos", items:[
      "Os ícones do tempo ganharam um visual mais limpo: sol amarelo com raios, nuvem branca lisa e chuva em tracinhos azuis.",
      "Os ícones das notificações e das fotos de perfil seguem o mesmo desenho.",
    ]},
    {version:"1.21", date:"2026-10-20", title:"Lua como no céu", items:[
      "A Lua do PLUVIA agora fica inclinada como no céu de verdade: o lado iluminado aponta para o Sol.",
      "Perto do Equador, a lua crescente do fim de tarde aparece “deitada”, como um sorriso; mais ao sul, mais de lado.",
      "A inclinação muda com a cidade e a hora, no céu do fundo, no Ciclo do dia e no cartão da Lua.",
    ]},
    {version:"1.20", date:"2026-10-20", title:"Mapa colorido do Brasil", items:[
      "O mapa do Brasil agora pinta o país inteiro pela temperatura, do azul (frio) ao vermelho (calor).",
      "Além das 27 capitais, cidades do interior entram nas cores, para a Amazônia e o Cerrado não ficarem com a temperatura do litoral.",
      "Uma legenda embaixo do mapa mostra a escala de cores.",
    ]},
    {version:"1.19", date:"2026-10-20", title:"Chuva na próxima hora", items:[
      "Quando o radar vê chuva em cima da cidade ou chegando, Próximas horas mostra um gráfico de agora até daqui a 60 minutos.",
      "Embaixo, uma frase curta: quando a chuva chega e quanto tempo dura, ou quando deve diminuir.",
    ]},
    {version:"1.18.4", date:"2026-10-20", title:"Avisos sem repetição", items:[
      "Quem reinstalou o PLUVIA no iPhone não recebe mais o mesmo aviso duas vezes.",
      "Aviso do INMET que ainda vai começar diz quando começa, em vez de parecer que já vale.",
      "Aviso republicado pelo INMET com outro número não chega de novo.",
      "A bolinha no ícone do app some quando você abre o PLUVIA.",
    ]},
    {version:"1.18.3", date:"2026-10-20", title:"Ícone na Tela de Início", items:[
      "Mais uma correção para a logo aparecer ao adicionar o PLUVIA à Tela de Início do iPhone.",
    ]},
    {version:"1.18.2", date:"2026-10-20", title:"Prévia do link", items:[
      "A imagem que aparece quando alguém compartilha o link ganhou um céu de pôr do sol.",
    ]},
    {version:"1.18.1", date:"2026-10-20", title:"Ícone na Tela de Início", items:[
      "Adicionar o PLUVIA à Tela de Início do iPhone volta a mostrar a logo nova, em vez de só a letra P.",
    ]},
    {version:"1.18", date:"2026-10-20", title:"Logo nova, modos nas Próximas horas e estrelas que piscam", items:[
      "O PLUVIA tem logo nova: uma gota caindo na água, com duas ondinhas.",
      "O nome PLUVIA agora acompanha o céu: branco à noite e azul-marinho de dia, com a gota em azul-claro.",
      "Ícone do app, favicon, abertura, rodapé, imagem de compartilhar e a prévia do link no WhatsApp já estão com a logo nova.",
      "Botões, ícones, links e destaques trocaram o azul vivo pelas cores novas: azul-claro à noite e azul-marinho de dia.",
    ]},
    {version:"1.17", date:"2026-10-20", title:"Sensação e máxima nos blocos", items:[
      "Sensação térmica e máxima/mínima de hoje agora têm blocos próprios, junto com umidade, vento e os outros.",
      "A frase de ontem ficou mais curta: “Choveu cerca de 3 mm nas últimas 24 h.”",
    ]},
    {version:"1.16.2", date:"2026-10-19", title:"Topo só com o nome", items:[
      "O topo mostra só o nome PLUVIA, sem a gota, centralizado no mesmo eixo do nome da cidade e da temperatura.",
    ]},
    {version:"1.16.1", date:"2026-10-19", title:"Temperatura no eixo do app Tempo", items:[
      "A temperatura do topo foi um pouco para a esquerda: como no app Tempo, o número começa alinhado com o nome da cidade e o grau fica pendurado do lado.",
    ]},
    {version:"1.16", date:"2026-10-19", title:"Gota nova", items:[
      "A gota do PLUVIA ficou mais simples: a mesma forma de sempre, agora com uma onda só no meio. Aparece no topo, na abertura e no ícone do app na tela de início.",
      "Temperatura do topo um pouco menor, na mesma proporção do app Tempo: os números ficam mais ou menos da largura do nome da cidade.",
      "Em celulares bem estreitos, a temperatura de três algarismos e o nome PLUVIA não encostam mais nas bordas e nos botões do topo.",
    ]},
    {version:"1.15.2", date:"2026-10-19", title:"Topo no estilo do app Tempo", items:[
      "O topo ficou mais parecido com o app Tempo da Apple: nome da cidade em letra normal, temperatura mais fina e a condição e as máximas e mínimas no mesmo tamanho, tudo centralizado.",
      "Grau da temperatura um pouco menor, logo do PLUVIA maior e a temperatura mais perto do nome da cidade.",
      "Mais fotos de perfil: agora são 18 desenhos de tempo para escolher.",
      "Tocar na foto de perfil, no compartilhar e na busca não mostra mais um quadrado cinza: o botão só esmaece de leve.",
    ]},
    {version:"1.15.1", date:"2026-10-19", title:"Topo alinhado", items:[
      "O símbolo de grau da temperatura do topo ficou do tamanho do número, como no app Tempo da Apple.",
      "Topo alinhado: o número da temperatura fica no centro, embaixo do nome da cidade, e a foto de perfil tem a mesma margem da lupa do outro lado.",
      "Tocar em “Mais sobre o céu”, nos detalhes do ar e nas opções da conta não pisca mais um bloco cinza: o texto só esmaece de leve.",
    ]},
    {version:"1.15", date:"2026-10-19", title:"Fonte nova", items:[
      "As letras agora usam a fonte do próprio aparelho: no iPhone é a mesma do app Tempo da Apple. Como ela já vem no celular, o PLUVIA abre um pouco mais rápido.",
      "O % da umidade ficou maior e mais grosso.",
    ]},
    {version:"1.14.5", date:"2026-10-19", title:"Leituras mais fáceis de ler", items:[
      "As unidades dos blocos (%, hPa e km/h) ficaram maiores e mais grossas.",
      "Ar nos próximos dias mais limpo: cada dia mostra só a categoria, sem os números do índice e das partículas.",
      "O Ciclo do dia ganhou o mesmo Sol realista, com brilho, que aparece no céu do topo.",
    ]},
    {version:"1.14.4", date:"2026-10-19", title:"Umidade com ícone", items:[
      "A umidade ganhou um ícone para cada faixa: carinha para confortável, gota vazia para um pouco seco, gota cheia para úmido e muito úmido, e alerta para ar seco.",
      "O buraco embaixo da umidade sumiu: a nota da visibilidade medida no aeroporto ficou mais curta e cabe numa linha.",
      "Vento e pressão mais limpos: o vento mostra só as rajadas (a direção já está na bússola) e a pressão ficou só com o número.",
    ]},
    {version:"1.14.3", date:"2026-10-19", title:"Troca de cidade mais lisa", items:[
      "Trocar de cidade ficou mais suave: as informações descem sem engasgar, e numa cidade nova elas esperam a previsão chegar para descer de uma vez, em vez de trocar no meio do caminho.",
      "A barra de chuva agora se enche aos poucos até a intensidade da chuva quando a cidade aparece. Sem chuva, ela continua vazia: a chance de chover não enche a barra.",
    ]},
    {version:"1.14.2", date:"2026-10-19", title:"Umidade em palavras", items:[
      "A umidade agora sempre diz como está o ar: “Confortável”, “Úmido”, “Muito úmido”, “Um pouco seco” ou o alerta de ar seco. O buraco embaixo dela sumiu.",
    ]},
    {version:"1.14.1", date:"2026-10-19", title:"Lua mais natural", items:[
      "A Lua do cartão ficou mais nítida, com uma imagem da NASA em alta definição, e a luz agora cai aos poucos do lado claro para o escuro, como numa foto. A Lua do céu ganhou a mesma luz.",
      "Visibilidade mais limpa: o selo “Visibilidade reduzida” saiu (quebrava em duas linhas e deixava um buraco no bloco); a nota embaixo do número já diz se está reduzida.",
    ]},
    {version:"1.14", date:"2026-10-19", title:"Lua de verdade", items:[
      "O Ciclo do dia ganhou um cartão da Lua: a fase, quanto dela está iluminada, o próximo nascer ou pôr e quantos dias faltam para a lua cheia, com a Lua grande ao lado na fase de agora.",
      "Visibilidade mais fiel: quando há um aeroporto perto da cidade, o PLUVIA mostra a visibilidade medida lá em vez da estimativa do modelo, que às vezes inventava neblina de madrugada.",
    ]},
    {version:"1.13", date:"2026-10-19", title:"Chuva chegando no celular", items:[
      "Novo aviso no celular: quando o radar mostra chuva vindo na direção da sua cidade, o PLUVIA avisa com 10 a 60 minutos de antecedência, pelo movimento das últimas imagens. Se o movimento não está claro, ele não avisa.",
      "Quando o placar de acerto mostrar que outro modelo prevê a chuva da sua cidade claramente melhor, os avisos de chuva passam a usar esse modelo. Até lá, nada muda.",
    ]},
    {version:"1.12.1", date:"2026-10-19", title:"Topo mais limpo", items:[
      "A linha de concordância entre modelos (“Modelos divergem”, “Modelos concordam”) saiu de baixo do “Vai chover?”. A comparação continua dentro dos avisos de chuva no celular.",
    ]},
    {version:"1.12", date:"2026-10-19", title:"Chuva a caminho", items:[
      "Quando o radar mostra chuva vindo na direção da cidade, o “Vai chover?” diz em quantos minutos ela deve chegar, pelo movimento das últimas imagens. Se o movimento não está claro, ele não arrisca.",
      "Novo aviso no celular: “Parou de chover”, quando a estação do INMET ou o aeroporto deixam de registrar chuva. Ele só chega para quem recebeu o “Começou a chover”.",
      "O medidor de chuva embaixo do “Vai chover?” só mostra milímetros de verdade: o que a estação mediu ou o que o modelo prevê para a próxima hora. Antes ele inventava um número quando o modelo não dava volume.",
    ]},
    {version:"1.11", date:"2026-10-19", title:"Os modelos concordam?", items:[
      "Quando o “Vai chover?” diz chuva, o PLUVIA compara com outros três modelos de previsão (o europeu, o americano e o alemão) e diz se eles também preveem chuva nesse horário. Se nenhum concorda, ele avisa que pode não acontecer.",
      "Isso substitui o antigo selo de “confiança”, que era uma nota fixa e não comparava nada.",
      "Os avisos de chuva no celular também dizem se os outros modelos concordam, e os resumos da manhã e da noite chegam com prioridade, para o iPhone não segurar.",
    ]},
    {version:"1.10.3", date:"2026-10-15", title:"Avisos no celular mais úteis", items:[
      "Acabou o aviso de “mudança no tempo” toda manhã e toda tarde: o PLUVIA agora compara com o mesmo horário de ontem, então só avisa quando o dia vai ficar bem mais frio ou mais quente que o normal.",
      "Os resumos da manhã e da noite dizem a que horas a chuva é mais provável (ou que não há chuva prevista), em vez de só a chance máxima do dia.",
      "Avisos de chuva forte e de trovoada dizem quando devem começar, e não chega mais “chuva nas próximas horas” quando a estação ou o aeroporto já estão medindo chuva.",
    ]},
    {version:"1.10.2", date:"2026-10-15", title:"Radar sem travar", items:[
      "A animação do radar ampliado não para mais quando uma imagem falha: ela pula para a próxima e só para se todas falharem.",
      "As imagens que já carregaram ficam guardadas enquanto o mapa não muda, então a animação gasta muito menos internet e não esbarra no limite do serviço de radar.",
      "Saiu do app com o radar ampliado aberto? Ao voltar, a animação continua de onde estava.",
    ]},
    {version:"1.10.1", date:"2026-10-14", title:"Abertura mais leve", items:[
      "O PLUVIA faz menos trabalho ao abrir: a tela responde mais rápido ao primeiro toque, principalmente em celulares mais simples.",
      "A linha “Próxima janela seca” não ocupa mais espaço enquanto a previsão carrega (ela só aparece quando chove ou pode chover).",
    ]},
    {version:"1.10", date:"2026-10-14", title:"Rios e focos de calor", items:[
      "Nível do rio: em Manaus, Porto Velho, Santarém, Rio Branco e outras cidades na beira dos grandes rios da Amazônia, a tela inicial mostra a cota medida pela ANA e se o rio subiu ou desceu nas últimas 24 horas.",
      "Focos de calor: quando os satélites do INPE detectam focos a até 50 km da cidade nas últimas 24 horas, aparece quantos são e a que distância está o mais perto.",
      "Quem volta ao app com uma previsão salva antiga só vê o “Atualizando…” se a atualização demorar.",
    ]},
    {version:"1.9.6", date:"2026-10-14", title:"Cartões mais firmes e rodapé limpo", items:[
      "Os cartões da tela inicial ficaram menos transparentes, de dia e de noite, e a leitura ficou mais firme sobre o céu.",
      "Os links “Previsão nas capitais” e “Outras cidades” saíram do rodapé e agora ficam em “Previsão por cidade”, no fim de Minha conta.",
    ]},
    {version:"1.9.5", date:"2026-10-14", title:"Abertura com tudo pronto", items:[
      "A abertura do PLUVIA espera a previsão nova e os avisos do INMET chegarem, então a tela inicial já aparece atualizada, sem o “Atualizando…”. Com internet lenta, ela não segura mais que alguns segundos.",
      "O botão “Excluir minha conta” virou um cartão como os outros da conta, sem o contorno torto e sem o retângulo desalinhado ao tocar.",
    ]},
    {version:"1.9.4", date:"2026-10-14", title:"Mais ajustes na tela", items:[
      "Compartilhar sem o menu do celular: o título não fica mais por cima do texto, e o botão “Baixar imagem” aparece direito de dia.",
      "A linha “INMET · Sem alertas” ficou alinhada.",
      "Cidades favoritas atualizadas agora dizem “atualizado agora”, em vez de “há 0 min”."]},
    {version:"1.9.3", date:"2026-10-14", title:"Ajustes na tela", items:[
      "A janela de Novidades ficou com o mesmo visual das outras janelas.",
      "“Últimos 30 dias” não quebra mais em duas linhas, e em telas pequenas a barra de mínima e máxima dos 7 dias ficou maior.",
      "No detalhe do dia, a condição sobe para perto da data, e a linha “INMET · Sem alertas” usa um tamanho só de letra.",
      "A janela de novidades que aparece depois de uma atualização não corta mais o texto e mostra primeiro a novidade principal.",
      "Ao trocar para uma cidade sem previsão salva, a página não desce mais enquanto a previsão carrega."]},
    {version:"1.9.2", date:"2026-10-14", title:"Conta organizada", items:[
      "Personalizar a Home, Novidades, Fontes de dados, Privacidade e Termos de uso saíram do rodapé e agora ficam em “Mais do PLUVIA”, no fim de Minha conta.",
    ]},
    {version:"1.9.1", date:"2026-10-14", title:"Previsão mais coerente", items:[
      "A previsão agora vem inteira de uma fonte só (Open-Meteo), sem misturar outro modelo hora a hora. O MET Norway fica de reserva para quando a fonte principal cair, e o que está acontecendo agora continua vindo das estações do INMET e dos aeroportos.",
    ]},
    {version:"1.9", date:"2026-10-14", title:"Avisos de chuva de verdade", items:[
      "Novos avisos no celular: “Começou a chover”, quando a estação do INMET mede chuva ou o aeroporto mais próximo relata; “Trovoada agora”, quando o aeroporto relata trovoada; e “Chuva por perto”, quando há chuva ou trovoada nas proximidades. Vêm junto com os avisos de chuva e tempestade, sem precisar ligar nada.",
      "Cidades sem estação do INMET, como Fortaleza, São Luís, Aracaju e Boa Vista, ganham o “Medido agora” pelo boletim do aeroporto mais próximo.",
      "A trovoada relatada pelo aeroporto também acende os raios no céu do app, e “trovoada nas proximidades” avisa que a chuva pode chegar.",
    ]},
    {version:"1.8", date:"2026-10-13", title:"Chuva de verdade no topo", items:[
      "Quando a estação do INMET mais próxima mede chuva, ou o radar mostra chuva em cima da cidade, o topo do app passa a dizer que está chovendo, mesmo que a previsão diga nublado. O “Vai chover?” mostra quanto choveu e de onde veio a medição.",
      "Chuva medida com o ar muito instável aparece como chuva com trovoada, com os raios no céu do app. É uma estimativa pelo ar instável, não detecção de raios.",
      "A previsão não troca mais garoa ou chuva por “parcialmente nublado” ao juntar as duas fontes de dados.",
    ]},
    {version:"1.7.2", date:"2026-10-13", title:"Login mais protegido", items:[
      "Entrar, criar conta, recuperar a senha e ligar avisos sem conta agora passam por uma verificação de segurança contra robôs. Quase sempre ela é invisível; se aparecer uma caixinha, é só confirmar.",
    ]},
    {version:"1.7.1", date:"2026-10-13", title:"Localização mais certeira", items:[
      "Quem já liberou a localização tem a própria cidade aberta com mais frequência: o app espera um pouco mais pelo GPS e aproveita a posição recente do aparelho, sem mostrar erro quando ele não responde.",
    ]},
    {version:"1.7", date:"2026-10-13", title:"Raios de verdade", items:[
      "Em dia de trovoada, os raios agora descem do alto da tela, com ramos, um clarão que ilumina o céu e as nuvens inteiras e o brilho apagando devagar, cada vez num lugar diferente.",
      "Quem prefere menos movimento no celular continua sem raios.",
    ]},
    {version:"1.6.4", date:"2026-10-13", title:"Política de Privacidade", items:[
      "Nova página de Política de Privacidade, com o que é guardado, para quê, por quanto tempo, com quem é compartilhado e como pedir acesso, correção ou exclusão dos seus dados.",
      "Termos de uso e Privacidade ficam claros de dia e escuros à noite, conforme o céu da cidade aberta no app.",
    ]},
    {version:"1.6.3", date:"2026-10-13", title:"Termos mais fáceis de fechar", items:[
      "A página dos Termos de uso ganhou um X no alto para voltar ao PLUVIA de onde você parou, e agora abre e fecha com uma animação suave.",
    ]},
    {version:"1.6.2", date:"2026-10-13", title:"Termos de uso", items:[
      "Termos de uso: no primeiro acesso aparece um aviso curto, e criar conta ou ligar os avisos pede que você marque “Li e aceito os Termos de uso e a Política de privacidade”.",
      "O aviso não bloqueia a previsão: é só tocar em OK.",
    ]},
    {version:"1.6.1", date:"2026-10-13", title:"Minha conta mais curta", items:[
      "Minha conta agora é organizada em cartões que abrem e fecham, cada um mostrando como está: tipos de aviso, resumos, intensidade e silêncio, cidades e aparelhos. Dá para ver tudo sem rolar a tela inteira.",
    ]},
    {version:"1.6", date:"2026-10-13", title:"Temperatura medida e eclipses animados", items:[
      "Novo: “Medido agora”, no fim das leituras, mostra a última medição da estação automática do INMET mais perto da sua cidade: temperatura, umidade e chuva da última hora, com o horário. Aparece quando a medição tem menos de 2h30.",
      "Em “Mais sobre o céu”, cada eclipse ganhou uma ilustração animada: a Lua passa na frente do Sol até cobrir a parte que dá para ver da sua cidade (no anular, vira um anel), e a sombra da Terra cobre a Lua, que fica avermelhada no eclipse total.",
      "Suas cidades favoritas e as buscadas há pouco também abrem sem a página pular quando chega o aviso do INMET.",
      "Ajustes de acessibilidade: bolinhas das cidades com área de toque maior, botão “Entendi” mais legível e textos do céu organizados para leitores de tela.",
    ]},
    {version:"1.5", date:"2026-10-13", title:"Abertura sem pulos", items:[
      "Ao abrir o app, a faixa de aviso do INMET já guarda o lugar enquanto a consulta termina: a página não pula mais quando o aviso chega.",
      "A linha “Consultando” do INMET não fica mais com textos um em cima do outro no celular.",
      "Depois de cada atualização, uma janela como esta mostra o que mudou, só na primeira vez que você abre.",
    ]},
    {version:"1.4", date:"2026-10-12", title:"Eclipses no céu", items:[
      "Em “Mais sobre o céu”: o próximo eclipse do Sol e o próximo eclipse da Lua que dá para ver da sua cidade, com data, horário e quanto do Sol fica encoberto.",
      "Os cálculos são feitos no próprio aparelho para as coordenadas do município.",
    ]},
    {version:"1.3.1", date:"2026-10-12", title:"Janelas mais firmes", items:[
      "Uma janela que reabria logo depois de fechar (a da conta, por exemplo) às vezes sumia sozinha no iPhone. Não some mais.",
    ]},
    {version:"1.3", date:"2026-10-12", title:"Resumo da noite", items:[
      "Novo aviso opcional à noite com a previsão de amanhã: máxima, mínima e chance de chuva, no horário que você escolher (20h por padrão).",
      "Liga em Minha conta, na parte de avisos, junto do resumo da manhã.",
      "A foto de perfil volta a aparecer nas páginas das cidades.",
    ]},
    {version:"1.2.1", date:"2026-10-12", title:"Foto de perfil em todos os aparelhos", items:[
      "A foto de perfil agora acompanha a sua conta: escolha num aparelho e ela aparece nos outros.",
    ]},
    {version:"1.2", date:"2026-10-12", title:"Fotos de perfil e janelas claras de dia", items:[
      "Em Minha conta, escolha uma foto de perfil com um desenho do tempo: sol, lua, chuva, trovoada e outros.",
      "De dia, as janelas (conta, busca de cidades, novidades e as outras) ficam claras; à noite continuam escuras.",
      "O radar ampliado já abre mostrando a chuva se mexer, com o nome da sua cidade no mapa.",
      "Saíram o Comparar cidades e o convite para compartilhar o dia, que quase ninguém usava.",
    ]},
    {version:"1.1.2", date:"2026-10-12", title:"Rolagem sem cortes", items:[
      "Descer a página não mostra mais as seções cortadas pela metade: elas já aparecem inteiras.",
    ]},
    {version:"1.1.1", date:"2026-10-12", title:"Primeira abertura mais rápida", items:[
      "Logo, Lua e efeitos de chuva ficam guardados no aparelho por mais tempo, e a primeira abertura baixa menos coisa de novo.",
      "A Privacidade agora diz quem entrega o site (Cloudflare) e que o PLUVIA não usa a medição de visitas dela.",
    ]},
    {version:"1.1", date:"2026-10-12", title:"Últimos 30 dias", items:[
      "Novo atalho no fim dos 7 dias: quanto choveu na sua cidade no último mês, em quantos dias, o dia mais chuvoso, o mais quente e a noite mais fria.",
      "Os números são estimativas do modelo para o município, não medições de estação.",
      "Em dia de trovoada ou de pôr do sol bonito, a imagem compartilhada ganha um selo destacando o momento.",
    ]},
    {version:"1.0.1", date:"2026-10-11", title:"Aviso previsto mais discreto", items:[
      "Aviso do INMET que ainda vai começar aparece numa linha discreta no topo, em vez do cartão grande. Quando ele começa a valer, vira a faixa colorida.",
    ]},
    {version:"1.0", date:"2026-10-11", title:"O PLUVIA ganhou número de versão", items:[
      "Previsão por hora e para 7 dias, com “Vai chover?” no topo e a chuva das próximas horas.",
      "Avisos oficiais do INMET para a sua cidade e avisos no celular, até sem conta, com resumo do dia às 7h.",
      "Radar de chuva, qualidade do ar, UV, vento, pressão e o ciclo do Sol e da Lua.",
      "Céu animado que acompanha a hora e o tempo de cada cidade.",
      "Cidades favoritas, conta para sincronizar, comparar duas cidades e o Brasil agora.",
      "Compartilhar a previsão como story e contar se está chovendo aí.",
      "Novo: esta lista de novidades. Daqui pra frente, cada atualização aparece aqui.",
    ]},
  ];

  const parse = value => {
    const match = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(String(value || ""));
    return match ? [Number(match[1]), Number(match[2]), Number(match[3] || 0)] : null;
  };
  function compare(a, b) {
    const x = parse(a), y = parse(b);
    if (!x || !y) return NaN;
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
    return 0;
  }
  // Novidade (x.y) ou correção (x.y.z).
  const kind = version => (parse(version)?.[2] ? "fix" : "feature");
  const current = () => VERSIONS[0].version;
  const list = () => VERSIONS.map(entry => ({...entry, kind:kind(entry.version), items:[...entry.items]}));

  // A versão de novidades mais nova depois da última vista; null quando não há o que avisar.
  function pending(seen, versions = VERSIONS) {
    if (!parse(seen)) return null;
    return versions.find(entry => kind(entry.version) === "feature" && compare(entry.version, seen) > 0) || null;
  }
  function read(storage) { try { return storage?.getItem?.(SEEN_KEY) || null; } catch { return null; } }
  function remember(storage, version = current()) { try { storage?.setItem?.(SEEN_KEY, version); } catch {} }

  // Decide a linha de aviso na abertura: primeiro acesso só grava a versão atual; só correções
  // também gravam em silêncio. Devolve a versão a anunciar ou null.
  function announce(storage = runtime.localStorage) {
    const seen = read(storage);
    if (!seen) { remember(storage); return null; }
    const next = pending(seen);
    if (!next) { if (compare(current(), seen) > 0) remember(storage); return null; }
    return next;
  }

  const dateText = iso => {
    try { return (runtime.PLUVIA?.time?.dateFormat || ((locale, options) => new Intl.DateTimeFormat(locale, options)))("pt-BR", {timeZone:"UTC", day:"numeric", month:"short", year:"numeric"}).format(new Date(`${iso}T12:00:00Z`)); }
    catch { return iso; }
  };

  // Versões depois da última vista, no máximo `limit`: novidades primeiro (é a que o título anuncia),
  // depois as correções, cada grupo da mais nova para a mais antiga. Com 1.9, 1.9.1, 1.9.2 e 1.9.3 novas,
  // as três correções escondiam a 1.9.
  function since(seen, limit = 3, versions = VERSIONS) {
    if (!parse(seen)) return [];
    const fresh = versions.filter(entry => compare(entry.version, seen) > 0);
    const features = fresh.filter(entry => kind(entry.version) === "feature").slice(0, limit);
    const fixes = fresh.filter(entry => kind(entry.version) === "fix").slice(0, limit - features.length);
    return [...features, ...fixes];
  }

  function entryNode(doc, entry) {
    const item = doc.createElement("li"); item.className = "changelog-entry"; item.dataset.kind = entry.kind;
    const head = doc.createElement("h3");
    const badge = doc.createElement("span"); badge.className = "changelog-badge"; badge.textContent = entry.kind === "fix" ? "Correção" : "Novidade";
    head.append(`Versão ${entry.version}`, badge);
    const when = doc.createElement("p"); when.className = "changelog-date"; when.textContent = dateText(entry.date);
    item.append(head, when);
    if (entry.title) { const title = doc.createElement("p"); title.className = "changelog-title"; title.textContent = entry.title; item.append(title); }
    const points = doc.createElement("ul");
    points.append(...entry.items.map(text => { const point = doc.createElement("li"); point.textContent = text; return point; }));
    item.append(points);
    return item;
  }

  function mount(doc = runtime.document) {
    const el = id => doc.getElementById(id);
    const dialog = el("changelogDialog"), body = el("changelogList"), opener = el("openChangelog");
    if (!dialog || !body || !opener) return;
    const storage = runtime.localStorage;
    opener.textContent = `Novidades · v${current()}`;
    const track = source => runtime.pluviaAnalytics?.track?.("Changelog Opened", {source});
    const closeDialog = target => runtime.PLUVIA?.dialogs?.close?.(target) ?? target.close();
    let skipPopup = () => {};
    function open(source) {
      skipPopup();
      body.replaceChildren(...list().map(entry => entryNode(doc, entry)));
      remember(storage);
      if (!dialog.open) dialog.showModal();
      dialog.querySelector(".dialog-scroll")?.scrollTo?.(0, 0);
      track(source);
    }
    opener.addEventListener("click", () => open("account"));
    el("changelogClose")?.addEventListener("click", () => closeDialog(dialog));
    dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(dialog); });

    // Janela "O que há de novo": uma vez, na primeira abertura depois de uma versão de novidades, só depois
    // da intro e da primeira previsão (ou de 20 s sem previsão), sem cobrir outra janela aberta.
    const seen = read(storage), next = announce(storage);
    const popup = el("whatsNewDialog"), popupList = el("whatsNewList");
    if (!next || !popup || !popupList) return;
    const fresh = since(seen).map(entry => ({...entry, kind:kind(entry.version)}));
    const close = () => closeDialog(popup);
    el("whatsNewClose")?.addEventListener("click", close);
    el("whatsNewOk")?.addEventListener("click", close);
    el("whatsNewAll")?.addEventListener("click", () => { closeDialog(popup); open("update_note"); });
    popup.addEventListener("click", event => { if (event.target === popup) close(); });
    let shown = false, observer = null, timer = 0, settle = 0;
    // Quem abriu Novidades antes da janela já viu tudo: ela não aparece mais nesta abertura.
    skipPopup = () => { if (!shown) { shown = true; stop(); } };
    const started = Date.now();
    function ready() {
      const intro = el("pluviaIntro");
      if (intro && !intro.hidden) return false;
      if (doc.visibilityState === "hidden" || doc.querySelector("dialog[open]")) return false;
      const weather = typeof displayedWeather !== "undefined" && displayedWeather;
      return Boolean(weather) || Date.now() - started >= WAIT_MS;
    }
    function stop() {
      observer?.disconnect(); runtime.clearTimeout(timer); runtime.clearTimeout(settle);
      runtime.removeEventListener?.("pluvia:weather-updated", check);
      doc.removeEventListener("visibilitychange", check);
      doc.removeEventListener("close", check, true);
    }
    function show() {
      settle = 0;
      if (shown || !ready()) return;
      shown = true; stop();
      el("whatsNewTitle").textContent = `O PLUVIA ${next.version} chegou`;
      popupList.replaceChildren(...fresh.map(entry => entryNode(doc, entry)));
      remember(storage);
      popup.showModal();
      popup.querySelector(".dialog-scroll")?.scrollTo?.(0, 0);
    }
    // Um respiro depois de a página assentar, para a janela não surgir junto com a previsão.
    function check() { if (!shown && !settle && ready()) settle = runtime.setTimeout(show, SETTLE_MS); }
    runtime.addEventListener?.("pluvia:weather-updated", check);
    doc.addEventListener("visibilitychange", check);
    doc.addEventListener("close", check, true);
    const intro = el("pluviaIntro");
    if (intro && runtime.MutationObserver) {
      observer = new runtime.MutationObserver(check);
      observer.observe(intro, {attributes:true, attributeFilter:["hidden"]});
    }
    timer = runtime.setTimeout(check, WAIT_MS);
    check();
  }

  if (runtime.document) {
    if (runtime.document.readyState === "loading") runtime.document.addEventListener("DOMContentLoaded", () => mount(), {once:true});
    else mount();
  }

  return {VERSIONS, SEEN_KEY, parse, compare, kind, current, list, pending, since, announce, mount};
});
