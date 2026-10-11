(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.http = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (runtime) {
  "use strict";

  class RequestError extends Error {
    constructor(message, {status = 0, retryable = false, code = "request_error"} = {}) {
      super(message);
      this.name = "RequestError";
      this.status = status;
      this.retryable = retryable;
      this.code = code;
    }
  }

  // O Safari suspende a página em segundo plano e derruba as consultas em andamento ("Load failed").
  // Isso não é a fonte fora do ar: a falha recebe `background` e não entra na telemetria.
  let doc = null, hiddenAt = -Infinity;
  function watchVisibility() {
    if (doc || !runtime.document?.addEventListener) return;
    doc = runtime.document;
    doc.addEventListener("visibilitychange", () => { if (doc.hidden) hiddenAt = Date.now(); });
  }

  function createClient(options = {}) {
    watchVisibility();
    const fetchImpl = options.fetchImpl || runtime.fetch?.bind(runtime);
    const schedule = options.setTimeoutImpl || runtime.setTimeout?.bind(runtime);
    const cancelSchedule = options.clearTimeoutImpl || runtime.clearTimeout?.bind(runtime);
    const AbortControllerImpl = options.AbortControllerImpl || runtime.AbortController;
    const defaultTimeoutMs = Number.isFinite(options.defaultTimeoutMs) ? options.defaultTimeoutMs : 12000;
    const pending = new Set();

    async function getJson(url, requestOptions = {}) {
      if (typeof fetchImpl !== "function" || typeof AbortControllerImpl !== "function") {
        throw new RequestError("Cliente HTTP indisponível.", {code:"client_unavailable"});
      }
      const controller = new AbortControllerImpl();
      const timeoutMs = Number.isFinite(requestOptions.timeoutMs) ? requestOptions.timeoutMs : defaultTimeoutMs;
      let timedOut = false;
      let timeout = null;
      const abortFromSignal = () => controller.abort();
      const startedAt = Date.now();
      pending.add(controller);
      if (requestOptions.signal) {
        if (requestOptions.signal.aborted) controller.abort();
        else requestOptions.signal.addEventListener("abort", abortFromSignal, {once:true});
      }
      if (typeof schedule === "function" && timeoutMs > 0) {
        timeout = schedule(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs);
      }
      try {
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const response = await fetchImpl(url, {
          cache: requestOptions.cache || "default",
          headers: requestOptions.headers,
          ...(requestOptions.method ? {method: requestOptions.method, body: requestOptions.body} : {}),
          signal: controller.signal
        });
        if (!response.ok) {
          const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
          const code = response.status === 429 ? "rate_limited" : retryable ? "provider_unavailable" : "http_error";
          throw new RequestError("Fonte temporariamente indisponível.", {status:response.status,retryable,code});
        }
        try {
          const body = await (requestOptions.responseType === 'text' ? response.text() : response.json());
          if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          return body;
        } catch (error) {
          if (controller.signal.aborted || error?.name === 'AbortError') throw error;
          throw new RequestError("A fonte enviou uma resposta inválida.", {status:response.status,retryable:true,code:"invalid_response"});
        }
      } catch (error) {
        let failure;
        if (controller.signal.aborted || error?.name === "AbortError") {
          failure = new RequestError(timedOut ? "A fonte demorou para responder." : "Consulta cancelada.", {
            retryable: timedOut,
            code: timedOut ? "timeout" : "cancelled"
          });
        } else if (error instanceof RequestError) failure = error;
        else failure = new RequestError("Não foi possível consultar a fonte.", {
          retryable: error instanceof TypeError,
          code: "network_error"
        });
        if ((failure.code === "network_error" || failure.code === "timeout") && (doc?.hidden === true || hiddenAt >= startedAt)) failure.background = true;
        if (failure.code !== 'cancelled' && !failure.background) {
          try {
            const address = new URL(url), host = address.hostname;
            const component = host === 'api.open-meteo.com' ? 'weather' :
              host === 'air-quality-api.open-meteo.com' ? 'air-quality' :
              host === 'ensemble-api.open-meteo.com' ? 'ensemble' :
              host === 'apiprevmet3.inmet.gov.br' ? 'alerts' :
              host === 'api.rainviewer.com' ? 'radar' :
              host === 'dszyyrcvwrpyiypwyvxe.supabase.co' && address.pathname === '/functions/v1/met-forecast' ? 'met-norway' :
              host === 'dszyyrcvwrpyiypwyvxe.supabase.co' && address.pathname === '/functions/v1/lightning' ? 'lightning' : null;
            if (component) runtime.pluviaAnalytics?.reportFailure({component,error_code:failure.code,status:failure.status,error_type:failure.name});
          } catch { /* Optional telemetry must never change request behavior. */ }
        }
        throw failure;
      } finally {
        if (timeout != null && typeof cancelSchedule === "function") cancelSchedule(timeout);
        requestOptions.signal?.removeEventListener?.("abort", abortFromSignal);
        pending.delete(controller);
      }
    }

    function abortAll() {
      for (const controller of pending) controller.abort();
      pending.clear();
    }

    const getText = (url, requestOptions = {}) => getJson(url, {...requestOptions,responseType:'text'});
    return Object.freeze({getJson, getText, abortAll, pendingCount:() => pending.size});
  }

  return Object.freeze({RequestError, createClient, client:createClient()});
});
