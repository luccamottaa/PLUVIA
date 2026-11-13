// Fontes extras da previsão principal (novembro/2026, pedidos do dono). Duas peças, as duas opcionais e
// sem segurar a previsão do Open-Meteo além de um prazo curto:
//
// 1. Modelo de chuva por cidade: o placar (forecast-verify) aponta, por capital, um modelo do Open-Meteo que
//    acerta a chuva claramente melhor que o best_match (public.pluvia_rain_models, mesma regra dos avisos).
//    Com vencedor, só `precipitation` e `precipitation_probability` horárias vêm dele (horas iguais uma a
//    uma e as duas séries completas, senão nada troca); temperatura, códigos e diários continuam no
//    best_match. A lista é lida no máximo a cada 12 h e guardada neste aparelho; sem lista, nada troca.
// 2. "Testar Tomorrow.io": desligado por padrão, liga só neste aparelho (Mais do PLUVIA). Ligado, as horas e
//    o agora vêm do Tomorrow.io (função tomorrow-forecast, chave no servidor) por cima do Open-Meteo; campo
//    ausente fica com o Open-Meteo. Sem cota (429) ou com falha, a previsão segue só no Open-Meteo e o status
//    diz isso; passado o prazo, tenta o Tomorrow.io de novo. Desde a 1.73.4 vêm 120 horas (5 dias) e os dias que
//    elas cobrem são refeitos a partir delas (dailyFromHours); nascer/pôr do sol e os últimos dias continuam do
//    Open-Meteo. É teste: a previsão salva no aparelho continua sendo a do Open-Meteo.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.forecastSources = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (runtime) {
  "use strict";

  const PROJECT = "https://dszyyrcvwrpyiypwyvxe.supabase.co";
  const KEY = "sb_publishable_SdPTXhk3Q7aD-ra0S9dm_A_rnXSS4Jc";
  const TOMORROW_ENDPOINT = `${PROJECT}/functions/v1/tomorrow-forecast`;
  const MODELS = new Set(["ecmwf_ifs025", "gfs_seamless", "icon_seamless"]);
  const MODELS_KEY = "pluvia-rain-models", TEST_KEY = "pluvia-tomorrow-test";
  const MODELS_TTL = 12 * 3600_000, MODELS_RETRY = 30 * 60_000, TOMORROW_TTL = 30 * 60_000, LIMIT_WAIT = 30 * 60_000;
  const HOUR = 3600_000;

  const finite = (value, min, max) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
  const storage = () => { try { return runtime.localStorage || null; } catch { return null; } };

  // Lista {id IBGE: modelo}; qualquer chave ou modelo fora do esperado é descartado.
  function cleanModels(value) {
    const out = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return out;
    for (const [id, model] of Object.entries(value)) if (/^[0-9]{7}$/.test(id) && MODELS.has(model)) out[id] = model;
    return out;
  }

  // Mesma regra de withRainModel (push-process): horas iguais e as duas séries completas e válidas.
  function swapRain(forecast, other, model) {
    const times = forecast?.hourly?.time, theirs = other?.hourly?.time;
    if (!Array.isArray(times) || !times.length || !Array.isArray(theirs) || theirs.length !== times.length || times.some((time, index) => time !== theirs[index])) return null;
    const mm = other.hourly.precipitation, chance = other.hourly.precipitation_probability;
    const valid = (list, max) => Array.isArray(list) && list.length === times.length && list.every(value => finite(value, 0, max) !== null);
    if (!valid(mm, 500) || !valid(chance, 100)) return null;
    return {...forecast, hourly:{...forecast.hourly, precipitation:mm.slice(), precipitation_probability:chance.slice()}, pluviaRainModel:model};
  }

  // Leituras do Tomorrow.io por cima da previsão do Open-Meteo. Instantâneos (temperatura, vento, umidade…)
  // vêm do ponto que começa em T; chuva, chance e o código vêm da hora que termina em T (ponto T − 1 h), o
  // mesmo intervalo da chuva horária do Open-Meteo. Só substitui valor válido; ausente fica como estava.
  const INSTANT = [["temperature_2m","temperatureC"],["apparent_temperature","apparentC"],["relative_humidity_2m","humidity"],
    ["wind_speed_10m","windKmh"],["wind_gusts_10m","gustKmh"],["wind_direction_10m","windDirection"],["pressure_msl","pressureHpa"],
    ["uv_index","uvIndex"],["cloud_cover","cloudCover"],["dew_point_2m","dewPointC"]];
  const INTERVAL = [["precipitation","rainMm"],["rain","rainMm"],["precipitation_probability","probability"],["weather_code","code"]];
  // Campos que só o Tomorrow.io entrega (1.73.4): séries novas, criadas só se algum valor chegar; o detalhe da hora
  // mostra o que houver (modules/hourly-detail.js).
  const EXTRAS = [["pluvia_cloud_base","cloudBaseKm"],["pluvia_cloud_ceiling","cloudCeilingKm"],
    ["pluvia_surface_pressure","surfacePressureHpa"],["pluvia_precipitation_type","precipitationType"],["pluvia_rain_intensity","rainIntensityMmH"],
    ["pluvia_evapotranspiration","evapotranspirationMm"],["pluvia_uv_concern","uvConcern"]];
  function overlayTomorrow(forecast, data, city, parse) {
    const points = new Map();
    for (const item of Array.isArray(data?.hourly) ? data.hourly : []) {
      const at = Date.parse(item?.time);
      if (Number.isFinite(at)) points.set(at, item);
    }
    const times = forecast?.hourly?.time;
    if (!points.size || !Array.isArray(times) || typeof parse !== "function") return null;
    const hourly = {...forecast.hourly};
    const copies = new Map();
    const column = name => { if (!copies.has(name)) copies.set(name, Array.isArray(hourly[name]) ? hourly[name].slice() : null); return copies.get(name); };
    let replaced = 0;
    const touched = new Set();
    times.forEach((time, index) => {
      const at = parse(time, city);
      if (!Number.isFinite(at)) return;
      const now = points.get(at), before = points.get(at - HOUR);
      if (now || before) touched.add(String(time).slice(0, 10));
      for (const [name, field] of INSTANT) {
        const list = column(name), value = now?.[field];
        if (list && value !== null && value !== undefined) { list[index] = value; replaced++; }
      }
      for (const [name, field] of EXTRAS) {
        const value = now?.[field];
        if (value === null || value === undefined) continue;
        if (!copies.has(name)) copies.set(name, times.map(() => null));
        copies.get(name)[index] = value;
      }
      const visibility = column("visibility");
      if (visibility && typeof now?.visibilityKm === "number") { visibility[index] = Math.round(now.visibilityKm * 1000); replaced++; }
      for (const [name, field] of INTERVAL) {
        const list = column(name), value = before?.[field];
        if (list && value !== null && value !== undefined) { list[index] = value; replaced++; }
      }
    });
    if (!replaced) return null;
    for (const [name, list] of copies) if (list) hourly[name] = list;
    const daily = dailyFromHours(forecast.daily, hourly, touched);
    const current = {...forecast.current};
    const now = data.current;
    if (now && typeof now === "object") {
      for (const [name, field] of [...INSTANT.filter(([name]) => name !== "uv_index"), ["weather_code","code"]]) {
        if (name in current && now[field] !== null && now[field] !== undefined) current[name] = now[field];
      }
    }
    // Qualidade do ar do agora (1.73.6), só quando o índice chega; app.js troca o CAMS por ela no cartão.
    const air = now && Number.isFinite(now.aqi) ? {aqi:now.aqi, pollutant:now.aqiPollutant ?? null, pm25:now.pm25 ?? null, pm10:now.pm10 ?? null,
      o3Ppb:now.o3Ppb ?? null, no2Ppb:now.no2Ppb ?? null, so2Ppb:now.so2Ppb ?? null} : null;
    return {...forecast, current, hourly, ...(daily ? {daily} : {}), ...(air ? {pluviaTomorrowAir:air} : {}), pluviaSource:"tomorrow", pluviaTomorrowDays:daily ? touched.size : 0};
  }

  // Dias a partir das horas (1.73.4, pedido do dono: "os 7 dias" também do Tomorrow.io). Para cada dia local que
  // ganhou ao menos uma hora do Tomorrow.io, refaz os diários com as 24 horas daquele dia já misturadas (horas
  // passadas do Open-Meteo, as que vêm do Tomorrow.io por cima): máxima e mínima, sensação, chuva somada, chance
  // e UV máximos e a condição mais severa do dia (como o weather_code diário do Open-Meteo). Dia sem as 24 horas
  // válidas fica como estava; nascer/pôr do sol, sol e luz do dia continuam do Open-Meteo.
  const DAILY_FROM_HOURS = [
    ["temperature_2m_max", "temperature_2m", "max"], ["temperature_2m_min", "temperature_2m", "min"],
    ["apparent_temperature_max", "apparent_temperature", "max"], ["apparent_temperature_min", "apparent_temperature", "min"],
    ["precipitation_sum", "precipitation", "sum"], ["rain_sum", "rain", "sum"],
    ["precipitation_probability_max", "precipitation_probability", "max"], ["uv_index_max", "uv_index", "max"],
    ["weather_code", "weather_code", "max"]
  ];
  function dailyFromHours(daily, hourly, days) {
    const dates = daily?.time, times = hourly?.time;
    if (!days?.size || !Array.isArray(dates) || !Array.isArray(times)) return null;
    const out = {...daily};
    let changed = 0;
    dates.forEach((date, d) => {
      if (!days.has(String(date))) return;
      const hours = [];
      times.forEach((time, index) => { if (String(time).startsWith(String(date))) hours.push(index); });
      if (hours.length !== 24) return;
      for (const [name, source, mode] of DAILY_FROM_HOURS) {
        const list = hourly[source];
        if (!Array.isArray(out[name]) || !Array.isArray(list)) continue;
        const values = hours.map(index => list[index]);
        if (values.some(value => typeof value !== "number" || !Number.isFinite(value))) continue;
        const value = mode === "max" ? Math.max(...values) : mode === "min" ? Math.min(...values) : Math.round(values.reduce((a, b) => a + b, 0) * 10) / 10;
        if (out[name] === daily[name]) out[name] = daily[name].slice();
        out[name][d] = value; changed++;
      }
    });
    return changed ? out : null;
  }

  function createSources({fetchJson, now = () => Date.now(), parse = (value, city) => runtime.PLUVIA?.time?.parse?.(value, city), forecastUrl = city => runtime.PLUVIA?.services?.weather?.forecastUrl?.(city), store = storage} = {}) {
    let models = null, modelsAt = 0, modelsTried = 0, modelsTask = null;
    let blockedUntil = 0;
    const tomorrowCache = new Map();
    const get = fetchJson || ((url, options) => {
      const client = runtime.PLUVIA?.http?.createClient?.({defaultTimeoutMs:6000});
      if (!client) return Promise.reject(new Error("Cliente HTTP indisponível."));
      return client.getJson(url, options);
    });

    function readSaved() {
      if (models) return;
      try {
        const saved = JSON.parse(store()?.getItem(MODELS_KEY) || "null");
        if (saved && Number.isFinite(saved.at) && now() - saved.at < 2 * MODELS_TTL) { models = cleanModels(saved.map); modelsAt = saved.at; }
      } catch {}
    }
    function refreshModels() {
      readSaved();
      if (modelsTask || (models && now() - modelsAt < MODELS_TTL) || now() - modelsTried < MODELS_RETRY) return modelsTask;
      modelsTried = now();
      modelsTask = Promise.resolve().then(() => get(`${PROJECT}/rest/v1/rpc/pluvia_rain_models`, {timeoutMs:6000, cache:"no-store", headers:{apikey:KEY, Authorization:`Bearer ${KEY}`}}))
        .then(value => {
          models = cleanModels(value); modelsAt = now();
          try { store()?.setItem(MODELS_KEY, JSON.stringify({at:modelsAt, map:models})); } catch {}
          return models;
        }).catch(() => models).finally(() => { modelsTask = null; });
      return modelsTask;
    }
    // Sem lista guardada ainda, a primeira abertura não espera a lista: só a próxima previsão usa o vencedor.
    function modelFor(city) {
      refreshModels();
      return models && /^[0-9]{7}$/.test(String(city?.id)) ? models[city.id] || null : null;
    }
    function rainUrl(city, model) {
      const base = forecastUrl(city);
      if (!base) return null;
      const url = new URL(base);
      url.searchParams.delete("current"); url.searchParams.delete("daily");
      url.searchParams.set("hourly", "precipitation,precipitation_probability");
      url.searchParams.set("models", model);
      return url.href;
    }

    const testEnabled = () => { try { return store()?.getItem(TEST_KEY) === "1"; } catch { return false; } };
    function setTestEnabled(on) {
      try { if (on) store()?.setItem(TEST_KEY, "1"); else store()?.removeItem(TEST_KEY); } catch {}
      tomorrowCache.clear(); blockedUntil = 0;
      runtime.dispatchEvent?.(new CustomEvent("pluvia:tomorrow-test-changed", {detail:{on:Boolean(on)}}));
    }
    function tomorrowFor(city) {
      if (!testEnabled()) return null;
      const lat = Number(city?.lat ?? city?.latitude), lon = Number(city?.lon ?? city?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Promise.resolve({status:"failed"});
      if (now() < blockedUntil) return Promise.resolve({status:"limited"});
      const id = `${lat.toFixed(2)},${lon.toFixed(2)}`, hit = tomorrowCache.get(id);
      if (hit && now() - hit.at < TOMORROW_TTL) return Promise.resolve({status:"on", data:hit.data});
      return Promise.resolve().then(() => get(`${TOMORROW_ENDPOINT}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, {timeoutMs:7000, cache:"no-store"}))
        .then(data => {
          if (!Array.isArray(data?.hourly)) return {status:"failed"};
          if (tomorrowCache.size >= 12) tomorrowCache.delete(tomorrowCache.keys().next().value);
          tomorrowCache.set(id, {at:now(), data});
          return {status:"on", data};
        })
        .catch(error => {
          if (error?.code === "cancelled") throw error;
          if (error?.code === "rate_limited") { blockedUntil = now() + LIMIT_WAIT; return {status:"limited"}; }
          return {status:"failed"};
        });
    }

    // Começa as consultas extras junto com a previsão principal (em paralelo).
    function start(city) {
      const model = modelFor(city);
      const url = model ? rainUrl(city, model) : null;
      const rain = url ? Promise.resolve().then(() => get(url, {timeoutMs:8000})).then(other => ({model, other})).catch(() => null) : null;
      const tomorrow = tomorrowFor(city);
      return rain || tomorrow ? {rain, tomorrow, city} : null;
    }
    // Espera cada extra até `waitMs` depois da previsão principal; o que não chegar fica de fora.
    async function apply(forecast, task, {valid = () => true, waitMs = 2500} = {}) {
      if (!task) return forecast;
      const late = Symbol("late");
      const deadline = new Promise(resolve => setTimeout(() => resolve(late), waitMs));
      const settle = promise => promise ? Promise.race([promise.catch(() => null), deadline]) : Promise.resolve(null);
      const [rain, tomorrow] = await Promise.all([settle(task.rain), settle(task.tomorrow)]);
      let shown = forecast;
      if (rain && rain !== late) { const swapped = swapRain(shown, rain.other, rain.model); if (swapped && valid(swapped)) shown = swapped; }
      if (task.tomorrow) {
        const result = tomorrow && tomorrow !== late ? tomorrow : {status:"failed"};
        const overlaid = result.status === "on" ? overlayTomorrow(shown, result.data, task.city, parse) : null;
        shown = overlaid && valid(overlaid) ? overlaid : {...shown, pluviaTomorrow:result.status === "limited" ? "limited" : "failed"};
      }
      return shown;
    }
    return {start, apply, modelFor, refreshModels, testEnabled, setTestEnabled};
  }

  // Botão de Mais do PLUVIA (#tomorrowTest): estado em aria-pressed e no texto ao lado.
  function wireToggle(doc, sources) {
    const button = doc?.getElementById?.("tomorrowTest"), state = doc?.getElementById?.("tomorrowTestState");
    if (!button) return;
    const paint = () => { const on = sources.testEnabled(); button.setAttribute("aria-pressed", String(on)); if (state) state.textContent = on ? "Ligado" : "Desligado"; };
    button.addEventListener("click", () => { sources.setTestEnabled(!sources.testEnabled()); paint(); });
    paint();
  }

  // "Testar Tomorrow.io" ligado, para outros módulos (o mapa do radar não lê o armazenamento por conta própria; 1.73.9).
  const tomorrowTestOn = () => { try { return storage()?.getItem(TEST_KEY) === "1"; } catch { return false; } };
  const api = {swapRain, overlayTomorrow, cleanModels, createSources, tomorrowTestOn};
  if (runtime.document) {
    Object.assign(api, createSources());
    const wire = () => wireToggle(runtime.document, api);
    if (runtime.document.readyState === "loading") runtime.document.addEventListener("DOMContentLoaded", wire, {once:true}); else wire();
  }
  return api;
});
