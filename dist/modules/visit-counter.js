// Contador anônimo de aparelhos por dia: cada aparelho soma +1 uma vez por dia no Supabase.
// Não vai identificador, cidade, conta nem texto; o aparelho só lembra a data da última contagem.
// Fica fora do PostHog (que depende de participação): é uma soma, não um evento sobre a pessoa.
// Respeita Do Not Track/GPC, só conta no domínio público e nunca atrapalha a página.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.visitCounter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (runtime) {
  "use strict";
  const ENDPOINT = "https://dszyyrcvwrpyiypwyvxe.supabase.co/rest/v1/rpc/pluvia_count_visit";
  const KEY = "sb_publishable_SdPTXhk3Q7aD-ra0S9dm_A_rnXSS4Jc";
  const DAY_KEY = "pluvia-visit-day";
  const HOSTS = new Set(["pluviaweather.com.br", "www.pluviaweather.com.br"]);

  // Dia no horário de Brasília, igual ao servidor (YYYY-MM-DD).
  function today(now) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit"}).formatToParts(now);
      const get = type => parts.find(part => part.type === type)?.value;
      const value = `${get("year")}-${get("month")}-${get("day")}`;
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
    } catch { return null; }
  }

  function optedOut(navigator, window) {
    return navigator?.doNotTrack === "1" || window?.doNotTrack === "1" || navigator?.globalPrivacyControl === true;
  }

  // Devolve true quando a contagem foi enviada. Sem storage não dá para saber se o aparelho já
  // contou hoje, então não conta (melhor faltar do que contar em dobro).
  async function count({storage = runtime.localStorage, fetchImpl = runtime.fetch, navigator = runtime.navigator, window = runtime, host = runtime.location?.hostname, now = new Date()} = {}) {
    try {
      if (!HOSTS.has(host) || optedOut(navigator, window) || typeof fetchImpl !== "function") return false;
      const day = today(now);
      if (!day || storage?.getItem?.(DAY_KEY) === day) return false;
      // Marca antes de enviar: duas abas abertas juntas não contam duas vezes.
      storage.setItem(DAY_KEY, day);
      if (storage.getItem(DAY_KEY) !== day) return false;
      const response = await fetchImpl(ENDPOINT, {
        method:"POST", body:"{}", keepalive:true, credentials:"omit", referrerPolicy:"no-referrer",
        headers:{"Content-Type":"application/json", apikey:KEY, Authorization:`Bearer ${KEY}`},
        signal:typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(5000) : undefined,
      });
      return Boolean(response?.ok);
    } catch { return false; }
  }

  if (runtime.document && runtime.addEventListener) {
    // Depois da página pronta e sem disputar a rede da primeira previsão.
    const start = () => runtime.setTimeout(() => { count(); }, 4000);
    if (runtime.document.readyState === "complete") start();
    else runtime.addEventListener("load", start, {once:true});
  }

  return {count, today};
});
