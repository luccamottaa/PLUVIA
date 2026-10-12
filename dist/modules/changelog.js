// Versões do PLUVIA para as pessoas: 1.1, 1.2… trazem novidades; 1.1.1, 1.1.2… só correções.
// A lista é escrita à mão a cada publicação que muda algo visível (a mais nova primeiro).
// Depois de uma versão de novidades, quem já usava vê uma vez a linha "PLUVIA 1.x chegou".
// Correções não avisam: ficam só na lista. Primeiro acesso não avisa nada.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.changelog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (runtime) {
  "use strict";
  const SEEN_KEY = "pluvia-seen-version";
  const VERSIONS = [
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

  function mount(doc = runtime.document) {
    const el = id => doc.getElementById(id);
    const dialog = el("changelogDialog"), body = el("changelogList"), opener = el("openChangelog");
    if (!dialog || !body || !opener) return;
    const storage = runtime.localStorage;
    opener.textContent = `Novidades · v${current()}`;
    const track = source => runtime.pluviaAnalytics?.track?.("Changelog Opened", {source});
    const close = () => runtime.PLUVIA?.dialogs?.close?.(dialog) ?? dialog.close();
    function render() {
      body.replaceChildren(...list().map(entry => {
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
      }));
    }
    function open(source) {
      render(); remember(storage); hideNote();
      if (!dialog.open) dialog.showModal();
      dialog.querySelector(".dialog-scroll")?.scrollTo?.(0, 0);
      track(source);
    }
    const note = el("updateNote"), noteText = el("updateNoteText");
    function hideNote() { if (note) note.hidden = true; }
    const next = announce(storage);
    if (next && note && noteText) {
      noteText.textContent = `PLUVIA ${next.version} chegou: ${next.title}.`;
      note.hidden = false;
    }
    opener.addEventListener("click", () => open("footer"));
    el("updateNoteOpen")?.addEventListener("click", () => open("update_note"));
    el("updateNoteDismiss")?.addEventListener("click", () => { remember(storage); hideNote(); });
    el("changelogClose")?.addEventListener("click", close);
    dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
  }

  if (runtime.document) {
    if (runtime.document.readyState === "loading") runtime.document.addEventListener("DOMContentLoaded", () => mount(), {once:true});
    else mount();
  }

  return {VERSIONS, SEEN_KEY, parse, compare, kind, current, list, pending, announce, mount};
});
