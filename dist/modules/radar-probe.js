/* Radar observado: só eleva cautela se houver eco. Ausência de eco nunca prova céu seco. */
(() => {
  const app = globalThis.PLUVIA = globalThis.PLUVIA || {};
  const state = { status: "idle", precipitating: false, checkedAt: null, cityId: null };

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

  async function probe(city) {
    if (typeof document === "undefined" || !city || !Number.isFinite(Number(city.lat)) || !Number.isFinite(Number(city.lon))) {
      return snapshot();
    }
    const cityId = String(city.id || "");
    state.cityId = cityId;
    state.status = "loading";
    try {
      const meta = await fetch("https://api.rainviewer.com/public/weather-maps.json", { cache: "no-store" });
      if (!meta.ok) throw new Error("meta");
      const json = await meta.json();
      const past = json?.radar?.past || [];
      const frame = past[past.length - 1];
      if (!frame?.path || !frame.host) throw new Error("frame");
      const z = 9;
      const { tileX, tileY, px, py } = lonLatToPixel(city.lon, city.lat, z);
      const url = `${frame.host}${frame.path}/256/${z}/${tileX}/${tileY}/2/1_1.png`;
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        const timer = setTimeout(() => reject(new Error("timeout")), 8000);
        img.onload = () => { clearTimeout(timer); resolve(img); };
        img.onerror = () => { clearTimeout(timer); reject(new Error("tile")); };
        img.src = url;
      });
      if (state.cityId !== cityId) return snapshot();
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
    } catch {
      if (state.cityId !== cityId) return snapshot();
      state.precipitating = false;
      state.status = "unavailable";
      state.checkedAt = Date.now();
      app.sources?.set("radar", { status: "error" });
    }
    paintSignal();
    return snapshot();
  }

  app.radar = { probe, get: snapshot, lonLatToPixel };
  if (typeof module === "object" && module.exports) module.exports = app.radar;
})();
