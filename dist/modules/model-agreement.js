/* Concordância entre modelos no "Vai chover?": quando a previsão principal (Open-Meteo, best_match) diz
   chuva ou "pode chover", uma consulta leve pergunta a outros três modelos (ECMWF IFS, GFS e ICON) se
   eles também têm chuva nas MESMAS horas (intervalos que terminam nos carimbos da janela). Nada é
   consultado com tempo seco. Modelo com hora ausente na janela fica fora; com menos de 2 válidos não se
   diz nada. É a mesma regra dos avisos no celular (push-process): heurística de confiança, não
   probabilidade calibrada. Cliente próprio, cache de 15 min por cidade (até 12), a troca de cidade
   descarta respostas atrasadas. Substitui o antigo "índice de confiança" fixo, que não comparava nada. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).modelAgreement = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (scope) {
  'use strict';
  const MODELS = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless'];
  const TTL_MS = 15 * 60_000, CACHE_LIMIT = 12;
  const cache = new Map();
  let client = null;

  function requestUrl(city) {
    const lat = Number(city?.lat), lon = Number(city?.lon), zone = String(city?.timezone || '');
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(zone)) return null;
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', lat.toFixed(4));
    url.searchParams.set('longitude', lon.toFixed(4));
    url.searchParams.set('hourly', 'precipitation');
    url.searchParams.set('models', MODELS.join(','));
    url.searchParams.set('timezone', zone);
    url.searchParams.set('forecast_days', '2');
    return url.href;
  }

  // window = [primeiro, último] carimbo "AAAA-MM-DDTHH:MM" no fuso da cidade (fins de intervalo).
  function count(payload, window, minMm = 0.5) {
    const times = payload?.hourly?.time;
    if (!Array.isArray(times) || !Array.isArray(window) || !window[0] || !window[1]) return null;
    const from = times.indexOf(String(window[0]).slice(0, 16)), to = times.indexOf(String(window[1]).slice(0, 16));
    if (from < 0 || to < from) return null;
    let agree = 0, total = 0;
    for (const model of MODELS) {
      const series = payload.hourly[`precipitation_${model}`];
      if (!Array.isArray(series)) continue;
      const values = series.slice(from, to + 1);
      if (values.length !== to - from + 1 || values.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) continue;
      total += 1;
      if (values.some(value => value >= minMm)) agree += 1;
    }
    return total >= 2 ? {agree, total} : null;
  }

  function describe(result) {
    if (!result) return null;
    const {agree, total} = result;
    if (agree === total) return {level:'high', label:'Modelos concordam', text:`Os outros ${total} modelos também preveem chuva nesse horário.`};
    if (agree === 0) return {level:'low', label:'Só um modelo', text:'Os outros modelos não preveem chuva nesse horário: pode não acontecer.'};
    return {level:'moderate', label:'Modelos divergem', text:`${agree} de ${total} outros modelos também preveem chuva nesse horário.`};
  }

  async function check(city, window, {minMm = 0.5, signal, now = Date.now()} = {}) {
    const url = requestUrl(city);
    if (!url || !Array.isArray(window)) return null;
    let entry = cache.get(url);
    if (!entry || now - entry.at > TTL_MS) {
      client ||= scope.PLUVIA?.http?.createClient?.({defaultTimeoutMs:10000}) || null;
      if (!client?.getJson) return null;
      const payload = await client.getJson(url, {signal, timeoutMs:10000});
      entry = {at:now, payload};
      cache.delete(url);
      cache.set(url, entry);
      while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    }
    return describe(count(entry.payload, window, minMm));
  }

  return {MODELS, requestUrl, count, describe, check, clear:() => cache.clear()};
});
