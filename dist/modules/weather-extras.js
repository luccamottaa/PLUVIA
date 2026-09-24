(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.extras = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function bestWindow(hourly, start, hourLimit = 12) {
    const end = Math.min(hourly?.time?.length || 0, start + 1 + hourLimit);
    const options = [];
    for (let i = start + 1; i + 1 < end; i++) {
      const slots = [i, i + 1];
      if (!slots.every(j => Number.isFinite(hourly.precipitation_probability?.[j]) && Number.isFinite(hourly.precipitation?.[j]) && Number.isFinite(hourly.apparent_temperature?.[j]) && Number.isFinite(hourly.uv_index?.[j]) && Number.isFinite(hourly.wind_gusts_10m?.[j]))) continue;
      const probability = Math.max(...slots.map(j => hourly.precipitation_probability[j]));
      const rain = slots.reduce((sum, j) => sum + hourly.precipitation[j], 0);
      const heat = Math.max(...slots.map(j => hourly.apparent_temperature[j]));
      const uv = Math.max(...slots.map(j => hourly.uv_index[j]));
      const gust = Math.max(...slots.map(j => hourly.wind_gusts_10m[j]));
      const score = probability * .75 + rain * 19 + Math.max(0, heat - 32) * 3 + Math.max(0, uv - 5) * 2 + Math.max(0, gust - 35) * .6;
      options.push({start:hourly.time[i - 1], end:hourly.time[i + 1], probability, rain, heat, uv, gust, score});
    }
    return options.sort((a,b) => a.score - b.score || a.start.localeCompare(b.start))[0] || null;
  }

  function ensembleAgreement(hourly, forecastTimes) {
    const members = Object.entries(hourly || {}).filter(([key, values]) => /^precipitation_member\d+$/.test(key) && Array.isArray(values));
    const times = hourly?.time;
    if (!Array.isArray(times) || members.length < 5 || !Array.isArray(forecastTimes)) return null;
    const samples = forecastTimes.map(time => times.indexOf(time)).filter(index => index >= 0).map(index => {
      const values = members.map(([, values]) => values[index]).filter(Number.isFinite);
      return values.length >= 5 ? values.filter(value => value > .1).length / values.length : null;
    }).filter(Number.isFinite);
    if (samples.length < 3) return null;
    const variation = Math.max(...samples.map(fraction => Math.min(fraction, 1 - fraction)));
    const level = variation >= .33 ? "baixa" : variation >= .15 ? "moderada" : "alta";
    return {level, members:members.length, hours:samples.length, tendency:samples.some(fraction => fraction >= .5) ? "chuva em parte do período" : "pouca chuva no período"};
  }

  return {bestWindow, ensembleAgreement};
});
