// Convite para colocar o PLUVIA na tela de início. Só no navegador do celular (nunca no app já
// instalado nem no computador), a partir da segunda visita e até "Agora não" (30 dias, só neste
// aparelho). Android/Chrome usa o pedido nativo (beforeinstallprompt); sem ele, e no iPhone, um passo a
// passo curto. No iPhone fora da Tela de Início o convite de avisos já explica a instalação: quando ele
// está à vista, este cartão não aparece.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.installPrompt = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (runtime) {
  "use strict";
  const DISMISS_KEY = "pluvia-install-dismissed", VISITS_KEY = "pluvia-install-visits", SESSION_KEY = "pluvia-install-session";
  const DISMISS_MS = 30 * 24 * 3600 * 1000;

  function platform(nav = runtime.navigator) {
    const ua = String(nav?.userAgent || "");
    if (/iPad|iPhone|iPod/.test(ua) || (nav?.platform === "MacIntel" && nav?.maxTouchPoints > 1)) return "ios";
    if (/Android/i.test(ua)) return "android";
    return "other";
  }
  function standalone(win = runtime) {
    try { return Boolean(win.matchMedia?.("(display-mode: standalone)")?.matches || win.matchMedia?.("(display-mode: fullscreen)")?.matches || win.navigator?.standalone === true); }
    catch { return false; }
  }
  // Contagem de sessões (uma por aba/abertura) e decisão. Storage bloqueado: não mostra (não dá para
  // lembrar o "Agora não", e o convite voltaria em toda visita).
  function shouldOffer({storage, session, now, os, installed}) {
    if (installed || os === "other") return false;
    try {
      const dismissed = Number(storage.getItem(DISMISS_KEY));
      if (Number.isFinite(dismissed) && dismissed > 0 && now - dismissed < DISMISS_MS && dismissed <= now) return false;
      let visits = Number(storage.getItem(VISITS_KEY)) || 0;
      if (session.getItem(SESSION_KEY) !== "1") { visits = Math.min(visits + 1, 99); storage.setItem(VISITS_KEY, String(visits)); session.setItem(SESSION_KEY, "1"); }
      return visits >= 2;
    } catch { return false; }
  }
  function steps(os, hasNativePrompt) {
    if (os === "ios") return ["Toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima, embaixo ou no topo da tela).", "Role e toque em <strong>Adicionar à Tela de Início</strong>.", "Toque em <strong>Adicionar</strong>."];
    return hasNativePrompt ? [] : ["Toque no menu do navegador (<strong>⋮</strong>, no canto da tela).", "Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.", "Confirme em <strong>Instalar</strong>."];
  }

  function mount({doc = runtime.document, win = runtime, storage = runtime.localStorage, session = runtime.sessionStorage, now = () => Date.now()} = {}) {
    const card = doc?.getElementById?.("installCard"), action = doc?.getElementById?.("installCardAction");
    if (!card || !action) return null;
    const os = platform(win.navigator), dialog = doc.getElementById("installDialog");
    let deferred = null, shown = false, done = false;
    const track = (name, props = {}) => runtime.pluviaAnalytics?.track?.(name, {platform:os, ...props});
    const closeDialog = () => dialog && (runtime.PLUVIA?.dialogs?.close?.(dialog) ?? dialog.close());
    const hide = () => { card.hidden = true; };
    const nudgeCoversInstall = () => os === "ios" && doc.getElementById("alertNudge")?.hidden === false;

    function paint() {
      if (done || standalone(win) || nudgeCoversInstall()) { hide(); return; }
      action.textContent = os === "android" && deferred ? "Instalar" : "Como instalar";
      if (card.hidden) { card.hidden = false; if (!shown) { shown = true; track("Install Prompt Shown"); } }
    }
    const offer = shouldOffer({storage, session, now:now(), os, installed:standalone(win)});

    win.addEventListener?.("beforeinstallprompt", event => {
      event.preventDefault?.(); // o convite próprio substitui a barra automática do Chrome
      deferred = event;
      if (offer) paint();
    });
    win.addEventListener?.("appinstalled", () => { deferred = null; done = true; hide(); closeDialog(); track("App Installed"); });
    // O convite de avisos (iPhone) aparece depois da previsão; não mostrar os dois juntos.
    const nudge = doc.getElementById("alertNudge");
    if (nudge && typeof runtime.MutationObserver === "function") new runtime.MutationObserver(() => { if (nudgeCoversInstall()) hide(); else if (offer) paint(); }).observe(nudge, {attributes:true, attributeFilter:["hidden"]});

    action.addEventListener("click", async () => {
      track("Install Prompt Tapped");
      if (deferred) {
        const prompt = deferred; deferred = null;
        try { await prompt.prompt(); const choice = await prompt.userChoice; if (choice?.outcome === "accepted") { done = true; hide(); } else paint(); } catch { paint(); }
        return;
      }
      const list = doc.getElementById("installSteps");
      if (list) list.innerHTML = steps(os, false).map(step => `<li>${step}</li>`).join("");
      if (dialog && !dialog.open) dialog.showModal();
    });
    doc.getElementById("installCardDismiss")?.addEventListener("click", () => {
      try { storage.setItem(DISMISS_KEY, String(now())); } catch {}
      done = true; hide(); track("Install Prompt Dismissed");
    });
    doc.getElementById("installClose")?.addEventListener("click", closeDialog);
    doc.getElementById("installDone")?.addEventListener("click", closeDialog);
    dialog?.addEventListener("click", event => { if (event.target === dialog) closeDialog(); });
    if (offer) paint();
    return {paint, platform:os, offered:offer};
  }

  if (runtime.document?.getElementById) {
    if (runtime.document.readyState === "loading") runtime.document.addEventListener("DOMContentLoaded", () => mount(), {once:true});
    else mount();
  }
  return {mount, platform, standalone, shouldOffer, steps, DISMISS_MS};
});
