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

  function createClient(options = {}) {
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
        const response = await fetchImpl(url, {
          cache: requestOptions.cache || "default",
          headers: requestOptions.headers,
          signal: controller.signal
        });
        if (!response.ok) {
          const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
          const code = response.status === 429 ? "rate_limited" : retryable ? "provider_unavailable" : "http_error";
          throw new RequestError("Fonte temporariamente indisponível.", {status:response.status,retryable,code});
        }
        try {
          return await response.json();
        } catch {
          throw new RequestError("A fonte enviou uma resposta inválida.", {status:response.status,retryable:true,code:"invalid_response"});
        }
      } catch (error) {
        if (error instanceof RequestError) throw error;
        if (error?.name === "AbortError") {
          throw new RequestError(timedOut ? "A fonte demorou para responder." : "Consulta cancelada.", {
            retryable: timedOut,
            code: timedOut ? "timeout" : "cancelled"
          });
        }
        throw new RequestError("Não foi possível consultar a fonte.", {
          retryable: error instanceof TypeError,
          code: "network_error"
        });
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

    return Object.freeze({getJson, abortAll, pendingCount:() => pending.size});
  }

  return Object.freeze({RequestError, createClient, client:createClient()});
});
