/* Radar observado: só eleva cautela se houver eco. Ausência de eco nunca prova céu seco. */
(() => {
  const app = globalThis.PLUVIA = globalThis.PLUVIA || {};
  const PROBE_TTL_MS = 8 * 60 * 1000;
  const REQUEST_TIMEOUT_MS = 8000;
  const state = { status: "idle", precipitating: false, checkedAt: null, cityId: null };
  let activeController = null;
  let inFlight = null;
  let inFlightCityId = null;
  let generation = 0;

  function lonLatToPixel(lon, lat, z) {
    const n = 256 * (2 ** z);
    const x = (Number(lon) + 180) / 360 * n;
    const latRad = Number(lat) * Math.PI / 180;
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
    return { tileX: Math.floor(x / 256), tileY: Math.floor(y / 256), px: Math.floor(x % 256), py: Math.floor(y % 256) };
  }

  function snapshot() {
    return { status: state.status, precipitating: state.precipitating, kind: "observation", checkedAt: state.checkedAt, cityId: state.cityId };
  }

  function paintSignal() {
    if (typeof renderGoOut === "function" && typeof displayedWeather !== "undefined") {
      renderGoOut(displayedWeather?.forecast, displayedWeather?.air);
    }
  }

  function reset(cityId = null) {
    generation++;
    activeController?.abort();
    activeController = null;
    inFlight = null;
    inFlightCityId = null;
    state.status = "idle";
    state.precipitating = false;
    state.checkedAt = null;
    state.cityId = cityId == null ? null : String(cityId);
    return snapshot();
  }

  function loadImage(url, signal) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        img.onload = null;
        img.onerror = null;
        signal?.removeEventListener?.("abort", onAbort);
        callback(value);
      };
      const onAbort = () => {
        try { img.src = ""; } catch {}
        finish(reject, new Error("aborted"));
      };
      if (signal?.aborted) { onAbort(); return; }
      signal?.addEventListener?.("abort", onAbort, { once: true });
      img.crossOrigin = "anonymous";
      img.onload = () => finish(resolve, img);
      img.onerror = () => finish(reject, new Error("tile"));
      img.src = url;
    });
  }

  async function executeProbe(city, cityId, requestGeneration, controller) {
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      const meta = await fetch("https://api.rainviewer.com/public/weather-maps.json", { cache: "no-store", signal: controller.signal });
      if (!meta.ok) throw new Error("meta");
      const json = await meta.json();
      const past = json?.radar?.past || [];
      const frame = past[past.length - 1];
      if (!frame?.path || !frame.host) throw new Error("frame");
      const z = 9;
      const { tileX, tileY, px, py } = lonLatToPixel(city.lon, city.lat, z);
      const url = `${frame.host}${frame.path}/256/${z}/${tileX}/${tileY}/2/1_1.png`;
      const image = await loadImage(url, controller.signal);
      if (generation !== requestGeneration || state.cityId !== cityId) return snapshot();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0);
      const radius = 6;
      const sx = Math.max(0, px - radius);
      const sy = Math.max(0, py - radius);
      const sw = Math.min(image.width - sx, radius * 2 + 1);
      const sh = Math.min(image.height - sy, radius * 2 + 1);
      const pixels = ctx.getImageData(sx, sy, sw, sh).data;
      let wet = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 48) wet++;
      state.precipitating = wet >= 3;
      state.status = "ready";
      state.checkedAt = Date.now();
      app.sources?.set("radar", { status: "ready", kind: "observation", dataAt: frame.time ? frame.time * 1000 : Date.now(), checkedAt: state.checkedAt });
    } catch (error) {
      if (generation !== requestGeneration || state.cityId !== cityId) return snapshot();
      state.precipitating = false;
      state.status = "unavailable";
      state.checkedAt = Date.now();
      app.sources?.set("radar", { status: timedOut ? "timeout" : "error", checkedAt: state.checkedAt });
    } finally {
      clearTimeout(timeout);
      if (activeController === controller) activeController = null;
    }
    if (generation === requestGeneration && state.cityId === cityId) paintSignal();
    return snapshot();
  }

  function probe(city) {
    if (typeof document === "undefined" || !city || !Number.isFinite(Number(city.lat)) || !Number.isFinite(Number(city.lon))) {
      return Promise.resolve(snapshot());
    }
    const cityId = String(city.id || "");
    if (state.cityId === cityId && state.status === "ready" && Date.now() - state.checkedAt < PROBE_TTL_MS) {
      return Promise.resolve(snapshot());
    }
    if (inFlight && inFlightCityId === cityId) return inFlight;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const requestGeneration = ++generation;
    state.cityId = cityId;
    state.status = "loading";
    state.precipitating = false;
    app.sources?.set("radar", { status: "loading", checkedAt: null, dataAt: null });
    inFlightCityId = cityId;
    const task = executeProbe(city, cityId, requestGeneration, controller).finally(() => {
      if (inFlight === task) {
        inFlight = null;
        inFlightCityId = null;
      }
    });
    inFlight = task;
    return task;
  }

  app.radar = { probe, reset, get: snapshot, lonLatToPixel, PROBE_TTL_MS };
  if (typeof module === "object" && module.exports) module.exports = app.radar;
})();
