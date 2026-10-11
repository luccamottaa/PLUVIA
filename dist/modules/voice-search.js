// Busca por voz no campo de cidades. Só aparece quando o navegador oferece reconhecimento de fala
// (Chrome/Edge; Safari depende do Siri ligado). O microfone só é pedido no toque, uma frase por vez,
// sem escuta contínua. O texto reconhecido entra no campo como se fosse digitado (evento input).
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.voiceSearch = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (runtime) {
  "use strict";

  // "Manaus." / "manaus amazonas" → "Manaus" / "manaus amazonas": tira pontuação final e espaços extras.
  function cleanTranscript(value) {
    return String(value || "").trim().replace(/[.!?,;:]+$/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  }

  function mount({doc = runtime.document, Recognition = runtime.SpeechRecognition || runtime.webkitSpeechRecognition} = {}) {
    const button = doc?.getElementById?.("voiceSearch");
    const input = doc?.getElementById?.("citySearch");
    const status = doc?.getElementById?.("cityPickerStatus");
    if (!button || !input) return null;
    if (typeof Recognition !== "function") { button.hidden = true; return null; }
    button.hidden = false;
    let recognition = null;
    const say = text => { if (status) status.textContent = text; };
    const stop = () => {
      button.setAttribute("aria-pressed", "false");
      button.removeAttribute("data-listening");
      const current = recognition; recognition = null;
      try { current?.abort?.(); } catch {}
    };
    button.addEventListener("click", () => {
      if (recognition) { stop(); say(""); return; }
      let heard = false;
      try {
        recognition = new Recognition();
        recognition.lang = "pt-BR";
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.continuous = false;
      } catch { recognition = null; say("A busca por voz não está disponível neste navegador."); return; }
      const mine = recognition;
      mine.onresult = event => {
        if (recognition !== mine) return;
        const text = cleanTranscript(event?.results?.[0]?.[0]?.transcript);
        if (!text) return;
        heard = true;
        input.value = text;
        input.dispatchEvent(new (runtime.Event || Event)("input", {bubbles:true}));
        input.focus?.();
      };
      mine.onerror = event => {
        if (recognition !== mine) return;
        const code = event?.error;
        say(code === "not-allowed" || code === "service-not-allowed" ? "Sem permissão para o microfone. Digite o nome da cidade."
          : code === "no-speech" ? "Não ouvi nada. Toque no microfone e fale o nome da cidade."
          : code === "aborted" ? "" : "Não deu para reconhecer. Tente de novo ou digite.");
      };
      mine.onend = () => {
        if (recognition !== mine) return;
        stop();
        if (heard) say("");
      };
      button.setAttribute("aria-pressed", "true");
      button.setAttribute("data-listening", "");
      say("Ouvindo… fale o nome da cidade.");
      try { mine.start(); } catch { stop(); say("Não deu para usar o microfone agora."); }
    });
    // Fechar o diálogo encerra a escuta.
    doc.getElementById?.("cityDialog")?.addEventListener?.("close", () => { if (recognition) { stop(); say(""); } });
    return {stop, listening: () => Boolean(recognition)};
  }

  if (runtime.document?.getElementById) {
    if (runtime.document.readyState === "loading") runtime.document.addEventListener("DOMContentLoaded", () => mount(), {once:true});
    else mount();
  }

  return {mount, cleanTranscript};
});
