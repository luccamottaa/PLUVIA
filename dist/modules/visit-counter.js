// Contador anônimo de aparelhos por dia: cada aparelho soma +1 uma vez por dia no Supabase.
// O identificador aleatório é persistido apenas no aparelho; o banco armazena somente seu hash diário.
// Não vai identificador pessoal, cidade, conta nem texto. Respeita DNT/GPC e não atrapalha a página.
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
  const CONSENT_KEY = "pluvia-analytics-consent-v1";
  const DEVICE_KEY = "pluvia-visit-device";
  const HOSTS = new Set(["pluviaweather.com.br", "www.pluviaweather.com.br"]);

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

  function deviceId(storage, crypto) {
    try {
      const saved = storage?.getItem?.(DEVICE_KEY);
      if (typeof saved === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) return saved;
      if (typeof crypto?.randomUUID !== "function") return null;
      const value = crypto.randomUUID();
      storage.setItem(DEVICE_KEY, value);
      return storage.getItem(DEVICE_KEY) === value ? value : null;
    } catch { return null; }
  }

  async function count({storage = runtime.localStorage, fetchImpl = runtime.fetch, navigator = runtime.navigator, window = runtime, crypto = runtime.crypto, host = runtime.location?.hostname, now = new Date()} = {}) {
    let day = null, marked = false;
    try {
      if (!HOSTS.has(host) || optedOut(navigator, window) || typeof fetchImpl !== "function" || !storage || storage.getItem(CONSENT_KEY) !== "1") return false;
      day = today(now);
      if (!day || storage.getItem(DAY_KEY) === day) return false;
      const id = deviceId(storage, crypto);
      if (!id) return false;
      storage.setItem(DAY_KEY, day);
      marked = storage.getItem(DAY_KEY) === day;
      if (!marked) return false;
      const response = await fetchImpl(ENDPOINT, {
        method:"POST", body:JSON.stringify({p_device_id:id}), keepalive:true, credentials:"omit", referrerPolicy:"no-referrer",
        headers:{"Content-Type":"application/json", apikey:KEY, Authorization:`Bearer ${KEY}`},
        signal:typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(5000) : undefined,
      });
      if (!response?.ok) { if (storage.getItem(DAY_KEY) === day) storage.removeItem(DAY_KEY); return false; }
      return true;
    } catch {
      if (marked && day) { try { if (storage.getItem(DAY_KEY) === day) storage.removeItem(DAY_KEY); } catch {} }
      return false;
    }
  }

  if (runtime.addEventListener) runtime.addEventListener("pluvia:analytics-consent", () => { count(); });

  if (runtime.document && runtime.addEventListener) {
    const start = () => runtime.setTimeout(() => { count(); }, 4000);
    if (runtime.document.readyState === "complete") start();
    else runtime.addEventListener("load", start, {once:true});
  }

  return {count, today};
});
