(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.smartSummary = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const max = values => Math.max(0, ...values.map(finite).filter(Number.isFinite));
  const sum = values => values.map(finite).filter(Number.isFinite).reduce((total, value) => total + value, 0);
  const round = (value, digits = 0) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

  function buildContext(data, air, start, city) {
    const hourly = data?.hourly || {};
    const current = data?.current || {};
    const slice = (name, hours) => Array.isArray(hourly[name]) ? hourly[name].slice(start, start + hours) : [];
    return {
      schemaVersion: 1,
      city: { id: String(city?.id || ""), name: String(city?.name || ""), timezone: String(city?.timezone || "UTC") },
      observedAt: String(current.time || ""),
      current: {
        code: finite(current.weather_code), temperature: finite(current.temperature_2m), apparent: finite(current.apparent_temperature),
        humidity: finite(current.relative_humidity_2m), precipitation: finite(current.precipitation), gust: finite(current.wind_gusts_10m)
      },
      next3h: { probability: max(slice("precipitation_probability", 3)), precipitation: sum(slice("precipitation", 3)), gust: max(slice("wind_gusts_10m", 3)), codes: slice("weather_code", 3).map(Number) },
      next6h: { probability: max(slice("precipitation_probability", 6)), precipitation: sum(slice("precipitation", 6)), gust: max(slice("wind_gusts_10m", 6)), codes: slice("weather_code", 6).map(Number) },
      uv: max(slice("uv_index", 3)),
      airQuality: finite(air?.current?.us_aqi)
    };
  }

  function contextHash(context) {
    const stable = JSON.stringify({
      city: context.city.id, period: context.observedAt.slice(0, 13), code: context.current.code,
      temperature: round(context.current.temperature), apparent: round(context.current.apparent), humidity: round(context.current.humidity),
      p3: round(context.next3h.probability, -0), mm3: round(context.next3h.precipitation, 1), mm6: round(context.next6h.precipitation, 1),
      gust: round(context.next3h.gust), uv: round(context.uv), aqi: round(context.airQuality)
    });
    let hash = 2166136261;
    for (let index = 0; index < stable.length; index += 1) hash = Math.imul(hash ^ stable.charCodeAt(index), 16777619);
    return `v1-${(hash >>> 0).toString(36)}`;
  }

  function highlight(label, tone, evidence) { return { label, tone, evidence }; }

  function deterministic(context) {
    const c = context.current;
    const h3 = context.next3h;
    const h6 = context.next6h;
    const storm = h3.codes.some(code => [95, 96, 99].includes(code));
    let result = {
      status: "calm", title: "Condições estáveis nas próximas horas",
      summary: `Não há sinal de chuva forte ou rajadas relevantes em ${context.city.name} nas próximas três horas.`,
      highlights: [highlight("Baixa chance de chuva", "calm", "next3h.probability")],
      iconCode: c.code ?? 0, evidence: ["next3h.probability", "next3h.precipitation", "next3h.gust"]
    };
    if (storm && h3.probability >= 60) result = {
      status:"danger", title:"Trovoada merece atenção", summary:"Há sinal de trovoada nas próximas três horas. Evite áreas abertas se a condição se confirmar.",
      highlights:[highlight(`Chance de chuva ${Math.round(h3.probability)}%`,"danger","next3h.probability"),highlight("Trovoada prevista pelo modelo","danger","next3h.codes")], iconCode:95, evidence:["next3h.probability","next3h.codes"]
    };
    else if ((h3.probability >= 80 && h3.precipitation >= 8) || h6.precipitation >= 20) result = {
      status:"danger", title:"Chuva intensa prevista", summary:"O modelo indica chuva relevante nas próximas horas. Considere rotas alternativas em áreas com histórico de alagamento.",
      highlights:[highlight(`${round(h6.precipitation,1)} mm em 6h`,"danger","next6h.precipitation"),highlight(`Pico de ${Math.round(h6.probability)}%`,"warning","next6h.probability")], iconCode:65, evidence:["next6h.precipitation","next6h.probability"]
    };
    else if (h3.gust >= 55) result = {
      status:"warning", title:"Rajadas fortes previstas", summary:"O vento é o principal ponto de atenção nas próximas três horas. Evite ficar próximo a galhos, placas e coberturas soltas.",
      highlights:[highlight(`Rajadas de até ${Math.round(h3.gust)} km/h`,"warning","next3h.gust")], iconCode:c.code ?? 3, evidence:["next3h.gust"]
    };
    else if (h3.probability >= 60 && h3.precipitation >= .5) result = {
      status:"warning", title:"Chuva prevista nas próximas horas", summary:"Há indicação de chuva na região nas próximas três horas. O horário exato pode variar dentro do município.",
      highlights:[highlight(`Chance de chuva ${Math.round(h3.probability)}%`,"warning","next3h.probability"),highlight(`${round(h3.precipitation,1)} mm em 3h`,"info","next3h.precipitation")], iconCode:63, evidence:["next3h.probability","next3h.precipitation"]
    };
    else if (c.apparent >= 40) result = {
      status:"warning", title:"Calor é o principal destaque", summary:"A sensação térmica está elevada agora. Água, sombra e pausas ajudam especialmente nas horas mais quentes.",
      highlights:[highlight(`Sensação de ${Math.round(c.apparent)} °C`,"warning","current.apparent"),highlight(`Umidade ${Math.round(c.humidity)}%`,"info","current.humidity")], iconCode:c.code ?? 0, evidence:["current.apparent","current.humidity"]
    };
    else if (context.uv >= 8) result.highlights.push(highlight(`UV ${Math.round(context.uv)} · alto`,"warning","uv"));
    else if (Number.isFinite(context.airQuality) && context.airQuality > 100) result.highlights.push(highlight(`AQI ${Math.round(context.airQuality)} · atenção`,"warning","airQuality"));
    return {...result, contextHash:contextHash(context), generatedAt:new Date().toISOString(), source:"rules"};
  }

  function validate(summary, context) {
    if (!summary || !["calm","info","warning","danger"].includes(summary.status)) return false;
    if (typeof summary.title !== "string" || !summary.title.trim() || summary.title.length > 90) return false;
    if (typeof summary.summary !== "string" || !summary.summary.trim() || summary.summary.length > 360) return false;
    if (!Array.isArray(summary.highlights) || summary.highlights.length > 4) return false;
    const allowed = new Set(["current.code","current.temperature","current.apparent","current.humidity","current.precipitation","current.gust","next3h.probability","next3h.precipitation","next3h.gust","next3h.codes","next6h.probability","next6h.precipitation","next6h.gust","next6h.codes","uv","airQuality"]);
    const evidence = [...(summary.evidence || []), ...summary.highlights.map(item => item.evidence)];
    return evidence.every(item => allowed.has(item)) && summary.contextHash === contextHash(context);
  }

  return { buildContext, contextHash, deterministic, validate };
});
