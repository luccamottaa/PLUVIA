// "Tá chovendo aí?": quem está na cidade responde com um toque e vê o que os outros disseram na
// última hora. Sem conta e sem localização: vai só o código IBGE da cidade aberta, a resposta e um
// identificador aleatório deste aparelho (o servidor guarda um hash dele por 2 dias, para limitar a um
// relato a cada 15 minutos). É relato de pessoas, não medição: a interface diz isso.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.rainReports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (runtime) {
  "use strict";
  const PROJECT = "https://dszyyrcvwrpyiypwyvxe.supabase.co";
  const KEY = "sb_publishable_SdPTXhk3Q7aD-ra0S9dm_A_rnXSS4Jc";
  const DEVICE_KEY = "pluvia-rain-device", ANSWER_KEY = "pluvia-rain-answer", READY_KEY = "pluvia-rain-ready";
  const ANSWER_MS = 15 * 60 * 1000, FRESH_MS = 2 * 60 * 1000;
  const KINDS = ["dry", "drizzle", "rain", "heavy"];
  const LABELS = {dry:"sem chuva", drizzle:"garoa", rain:"chuva", heavy:"chuva forte"};

  // Resumo da última hora em uma frase. Contagens inválidas viram ausência, nunca zero inventado.
  function summarize(row) {
    if (!row || typeof row !== "object") return "";
    const counts = KINDS.map(kind => [kind, Number.isInteger(row[kind]) && row[kind] >= 0 ? row[kind] : null]);
    if (counts.some(([, value]) => value === null)) return "";
    const total = counts.reduce((sum, [, value]) => sum + value, 0);
    if (!total) return "Ninguém respondeu na última hora.";
    const parts = counts.filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1])
      .map(([kind, value]) => `${value} ${LABELS[kind]}`);
    return `Na última hora: ${parts.join(" · ")} (${total === 1 ? "1 pessoa" : total + " pessoas"}).`;
  }

  function read(storage, key) { try { return JSON.parse(storage?.getItem?.(key) || "null"); } catch { return null; } }
  function write(storage, key, value) { try { storage?.setItem?.(key, JSON.stringify(value)); } catch {} }
  function deviceId(storage, crypto) {
    const saved = read(storage, DEVICE_KEY);
    if (typeof saved === "string" && /^[0-9a-f-]{32,36}$/.test(saved)) return saved;
    const id = typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : null;
    if (id) write(storage, DEVICE_KEY, id);
    return id;
  }

  function mount({doc = runtime.document, storage = runtime.localStorage, crypto = runtime.crypto, http = runtime.PLUVIA?.http, now = () => Date.now()} = {}) {
    const box = doc?.getElementById?.("rainReport"), summary = doc?.getElementById?.("rainReportSummary");
    if (!box || !summary) return null;
    const client = http?.createClient?.({defaultTimeoutMs:8000});
    const buttons = [...box.querySelectorAll("[data-kind]")];
    let city = null, revision = 0, cache = new Map();
    const headers = {apikey:KEY, Authorization:`Bearer ${KEY}`};
    // O cartão só aparece depois que o servidor respondeu uma vez (a função precisa estar publicada);
    // daí em diante este aparelho já o mostra na abertura, sem empurrar a página.
    let ready = read(storage, READY_KEY) === true;
    const reveal = () => { box.hidden = !(ready && city); };

    function paintAnswer() {
      const answer = read(storage, ANSWER_KEY);
      const recent = answer && answer.city === city?.id && now() - answer.at < ANSWER_MS && answer.at <= now() ? answer.kind : null;
      for (const button of buttons) {
        button.setAttribute("aria-pressed", String(button.dataset.kind === recent));
        button.disabled = Boolean(recent);
      }
      box.toggleAttribute("data-answered", Boolean(recent));
      return recent;
    }

    async function loadSummary(force = false) {
      const target = city, token = ++revision;
      if (!target || !client?.getJson) { summary.textContent = ""; return; }
      const hit = cache.get(target.id);
      if (!force && hit && now() - hit.at < FRESH_MS) { summary.textContent = hit.text; return; }
      try {
        const url = `${PROJECT}/rest/v1/rpc/pluvia_rain_reports?p_city=${encodeURIComponent(target.id)}`;
        const rows = await client.getJson(url, {headers, cache:"no-store"});
        if (token !== revision || target !== city) return;
        const text = summarize(Array.isArray(rows) ? rows[0] : rows);
        if (!ready && text) { ready = true; write(storage, READY_KEY, true); reveal(); }
        cache.set(target.id, {text, at:now()});
        if (cache.size > 20) cache.delete(cache.keys().next().value);
        summary.textContent = text;
      } catch (error) {
        if (token !== revision || error?.code === "cancelled") return;
        summary.textContent = "";
      }
    }

    async function report(kind) {
      const target = city, device = deviceId(storage, crypto);
      if (!target || !KINDS.includes(kind) || !client?.getJson) return;
      if (!device) { summary.textContent = "Não deu para enviar neste navegador."; return; }
      buttons.forEach(button => { button.disabled = true; });
      summary.textContent = "Enviando…";
      try {
        const result = await client.getJson(`${PROJECT}/rest/v1/rpc/pluvia_rain_report`, {
          method:"POST", cache:"no-store", headers:{...headers, "Content-Type":"application/json"},
          body:JSON.stringify({p_city:target.id, p_kind:kind, p_device:device})
        });
        if (target !== city) return;
        if (result === "ok" || result === "duplicate") {
          write(storage, ANSWER_KEY, {city:target.id, kind, at:now()});
          runtime.pluviaAnalytics?.track?.("Rain Report Sent", {kind});
          paintAnswer();
          summary.textContent = "Valeu!";
          await loadSummary(true);
          if (target === city && summary.textContent) summary.textContent = "Valeu! " + summary.textContent;
          return;
        }
        paintAnswer();
        summary.textContent = result === "busy" ? "Muita gente respondendo agora. Tente daqui a pouco." : "Não deu para enviar. Tente de novo.";
      } catch (error) {
        if (target !== city || error?.code === "cancelled") return;
        paintAnswer();
        summary.textContent = runtime.navigator?.onLine === false ? "Sem internet: tente quando a conexão voltar." : "Não deu para enviar. Tente de novo.";
      }
    }

    function setCity(next) {
      if (next?.id === city?.id) return;
      city = next && /^[0-9]{7}$/.test(next.id) ? next : null;
      revision++; client?.abortAll?.();
      summary.textContent = "";
      const question = doc.getElementById("rainReportQuestion");
      if (question) question.textContent = city ? `Tá chovendo aí em ${city.name}?` : "Tá chovendo aí?";
      reveal();
      paintAnswer();
      loadSummary();
    }

    box.addEventListener("click", event => {
      const button = event.target.closest?.("[data-kind]");
      if (button && !button.disabled) report(button.dataset.kind);
    });
    runtime.addEventListener?.("pluvia:city-changed", () => setCity(typeof activeCity !== "undefined" ? activeCity : null));
    if (typeof activeCity !== "undefined" && activeCity) setCity(activeCity);
    return {setCity, report, refresh:() => loadSummary(true)};
  }

  if (runtime.document?.getElementById) {
    if (runtime.document.readyState === "loading") runtime.document.addEventListener("DOMContentLoaded", () => mount(), {once:true});
    else mount();
  }
  return {mount, summarize, KINDS};
});
