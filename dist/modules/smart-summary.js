(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.smartSummary = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const max = values => values.length && values.every(Number.isFinite) ? Math.max(...values) : null;
  const sum = values => values.length && values.every(Number.isFinite) ? values.reduce((total,value)=>total+value,0) : null;
  const round = (value, digits = 0) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

  function buildContext(data, air, start, city) {
    const hourly = data?.hourly || {};
    const current = data?.current || {};
    const slice = (name, hours) => Array.isArray(hourly[name]) ? hourly[name].slice(start, start + hours) : [];
    const rainSlice = (name,hours) => {
      const values = Array.isArray(hourly[name]) ? hourly[name].slice(start+1,start+1+hours) : [];
      if (values.length !== hours || !values.every(value=>Number.isFinite(value) && value >= 0 && (name !== 'precipitation_probability' || value <= 100))) return [];
      for (let i=start;i<start+hours;i++) {
        if (Date.parse(hourly.time?.[i]?.slice(0,16)+'Z')+3600000 !== Date.parse(hourly.time?.[i+1]?.slice(0,16)+'Z')) return [];
      }
      return values;
    };
    const period = hours => ({
      probability:max(rainSlice('precipitation_probability',hours)),
      precipitation:sum(rainSlice('precipitation',hours)),
      gust:slice('wind_gusts_10m',hours).length === hours ? max(slice('wind_gusts_10m',hours)) : null,
      codes:slice('weather_code',hours).filter(value=>Number.isInteger(value) && value >= 0 && value <= 99)
    });
    const next3h = period(3), next6h = period(6);
    return {
      schemaVersion: 1,
      city: { id: String(city?.id || ""), name: String(city?.name || ""), timezone: String(city?.timezone || "UTC") },
      observedAt: String(current.time || ""),
      current: {
        code: finite(current.weather_code), temperature: finite(current.temperature_2m), apparent: finite(current.apparent_temperature),
        humidity: finite(current.relative_humidity_2m), precipitation: finite(current.precipitation), gust: finite(current.wind_gusts_10m)
      },
      next3h, next6h,
      complete: [next3h,next6h].every((period,i)=>[period.probability,period.precipitation,period.gust].every(Number.isFinite) && period.codes.length === (i ? 6 : 3)),
      uv: max(slice("uv_index", 3)),
      airQuality: finite(air?.current?.us_aqi)
    };
  }

  function contextHash(context) {
    const stable = JSON.stringify({
      city: context.city.id, period: context.observedAt.slice(0, 13), code: context.current.code,
      temperature: round(context.current.temperature), apparent: round(context.current.apparent), humidity: round(context.current.humidity),
      precipitation:round(context.current.precipitation,1),currentGust:round(context.current.gust),
      p3: round(context.next3h.probability, -0), mm3: round(context.next3h.precipitation, 1), mm6: round(context.next6h.precipitation, 1),
      gust: round(context.next3h.gust), uv: round(context.uv), aqi: round(context.airQuality),
      p6:round(context.next6h.probability),gust6:round(context.next6h.gust),codes3:context.next3h.codes,codes6:context.next6h.codes
    });
    let hash = 2166136261;
    for (let index = 0; index < stable.length; index += 1) hash = Math.imul(hash ^ stable.charCodeAt(index), 16777619);
    return `v2-${(hash >>> 0).toString(36)}`;
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
    if (context.complete === false) result = {
      status:'info',title:'Previsão parcial nas próximas horas',
      summary:'Não há dados suficientes para confirmar a chuva e o vento nas próximas horas.',
      highlights:[highlight('Dados horários incompletos','info','next3h.probability')],
      iconCode:c.code ?? 3,evidence:['next3h.probability']
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
    if (!Number.isInteger(summary.iconCode) || summary.iconCode < 0 || summary.iconCode > 99 ||
      !['rules','ai'].includes(summary.source) || !Number.isFinite(Date.parse(summary.generatedAt)) ||
      !Array.isArray(summary.evidence) || !summary.highlights.every(item=>item && typeof item.label === 'string' && item.label.length <= 80 && ['calm','info','warning','danger'].includes(item.tone))) return false;
    const allowed = new Set(["current.code","current.temperature","current.apparent","current.humidity","current.precipitation","current.gust","next3h.probability","next3h.precipitation","next3h.gust","next3h.codes","next6h.probability","next6h.precipitation","next6h.gust","next6h.codes","uv","airQuality"]);
    const evidence = [...(summary.evidence || []), ...summary.highlights.map(item => item.evidence)];
    return evidence.every(item => allowed.has(item)) && summary.contextHash === contextHash(context);
  }

  return { buildContext, contextHash, deterministic, validate };
});
