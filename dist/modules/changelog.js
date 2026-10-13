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

  // Versões depois da última vista (novidades e correções), a mais nova primeiro, no máximo `limit`.
  function since(seen, limit = 3, versions = VERSIONS) {
    if (!parse(seen)) return [];
    return versions.filter(entry => compare(entry.version, seen) > 0).slice(0, limit);
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
    function open(source) {
      body.replaceChildren(...list().map(entry => entryNode(doc, entry)));
      remember(storage);
      if (!dialog.open) dialog.showModal();
      dialog.querySelector(".dialog-scroll")?.scrollTo?.(0, 0);
      track(source);
    }
    opener.addEventListener("click", () => open("footer"));
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
