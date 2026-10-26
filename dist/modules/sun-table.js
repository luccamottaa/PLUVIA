// Nascer e pôr do sol dos próximos dias no calendário municipal ("Mais sobre o céu"). Cálculo por
// coordenadas (SunCalc, o mesmo de sky-atmosphere quando a previsão não cobre o dia): é astronomia,
// não previsão, por isso vai além dos 7 dias. Puro e sem timer: app.js pede de novo só quando a cidade
// ou o dia municipal mudam.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.sunTable = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const DAY_MS = 86400000;
  const valid = city => city && typeof city.timezone === "string" && Number.isFinite(Number(city.lat)) && Number.isFinite(Number(city.lon)) &&
    Math.abs(Number(city.lat)) <= 90 && Math.abs(Number(city.lon)) <= 180;
  function nextDate(date) {
    const day = new Date(date + "T12:00:00Z");
    day.setUTCDate(day.getUTCDate() + 1);
    return day.toISOString().slice(0, 10);
  }
  // Linhas {date, rise, set, length} (instantes em ms; length em minutos). Dia sem nascer ou pôr
  // (não acontece no Brasil, mas a função é genérica) fica com null, nunca com um horário inventado.
  function rows({city, at = Date.now(), days = 14, sun, time} = {}) {
    if (!valid(city) || !sun?.getTimes || !time?.dayKey || !time?.parse) return [];
    const lat = Number(city.lat), lon = Number(city.lon), out = [];
    let date = time.dayKey(at, city);
    for (let i = 0; date && i < Math.max(0, Math.min(days, 60)); i++, date = nextDate(date)) {
      const noon = time.parse(date + "T12:00:00", city);
      if (!Number.isFinite(noon)) { out.push({date, rise:null, set:null, length:null}); continue; }
      let result = {};
      try { result = sun.getTimes(new Date(noon), lat, lon) || {}; } catch (_) { result = {}; }
      const stamp = value => { const ms = value?.getTime?.(); return Number.isFinite(ms) && Math.abs(ms - noon) < DAY_MS ? ms : null; };
      const rise = stamp(result.sunrise), set = stamp(result.sunset);
      out.push({date, rise, set, length:rise !== null && set !== null && set > rise ? Math.round((set - rise) / 60000) : null});
    }
    return out;
  }
  const lengthText = minutes => Number.isFinite(minutes) ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}min` : "—";
  // Diferença do pôr do sol de hoje para o de daqui a uma semana, em minutos ("o pôr do sol fica 3 min
  // mais tarde"). Compara o relógio local (hora e minuto), não o instante; null sem as duas leituras.
  function setDrift(list, clock) {
    const first = list[0]?.set, week = list[7]?.set;
    if (!Number.isFinite(first) || !Number.isFinite(week) || typeof clock !== "function") return null;
    const minutes = value => { const [h, m] = String(clock(value)).split(":").map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN; };
    const diff = minutes(week) - minutes(first);
    return Number.isFinite(diff) ? diff : null;
  }
  return {rows, lengthText, setDrift};
});
