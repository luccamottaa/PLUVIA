/* Próximos eclipses do Sol e da Lua visíveis da cidade aberta. Os cálculos são do Astronomy Engine
   (MIT, vendor/astronomy-2.1.19.min.js), carregado só quando "Mais sobre o céu" abre: nada de fetch
   externo, timer ou DOM próprio. app.js lê o resultado guardado no relógio central e pede o cálculo
   quando o painel está aberto. Estimativa astronômica para as coordenadas do município. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).eclipses = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (scope) {
  'use strict';
  const SOURCE = '/vendor/astronomy-2.1.19.min.js?v=astronomy-2.1.19';
  const HORIZON_MS = 15 * 365.25 * 86400000;
  const MIN_OBSCURATION = .01;
  const CACHE_LIMIT = 20;
  const cache = new Map();
  let loading = null;

  function load() {
    if (scope.Astronomy) return Promise.resolve(scope.Astronomy);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const script = scope.document?.createElement?.('script');
      if (!script) { reject(new Error('astronomy_unavailable')); return; }
      script.src = SOURCE; script.async = true;
      script.onload = () => scope.Astronomy ? resolve(scope.Astronomy) : reject(new Error('astronomy_missing'));
      script.onerror = () => reject(new Error('astronomy_load_failed'));
      scope.document.head.append(script);
    }).catch(error => { loading = null; throw error; });
    return loading;
  }

  const ms = time => time?.date?.getTime?.();
  function moonAltitude(A, time, observer) {
    const equator = A.Equator(A.Body.Moon, time, observer, true, true);
    return A.Horizon(time, observer, equator.ra, equator.dec, 'normal').altitude;
  }

  // Primeiro eclipse do Sol com alguma fase acima do horizonte e pelo menos 1% do disco encoberto.
  function nextSolar(A, latitude, longitude, from) {
    const observer = new A.Observer(latitude, longitude, 0), until = from + HORIZON_MS;
    let eclipse = A.SearchLocalSolarEclipse(new Date(from), observer);
    for (let guard = 0; eclipse && guard < 60 && ms(eclipse.peak.time) < until; guard++) {
      const phases = [eclipse.partial_begin, eclipse.peak, eclipse.partial_end].filter(Boolean);
      if (Number.isFinite(eclipse.obscuration) && eclipse.obscuration >= MIN_OBSCURATION && phases.some(phase => phase.altitude > 0)) {
        return {kind:eclipse.kind, peak:ms(eclipse.peak.time), begin:ms(eclipse.partial_begin?.time), end:ms(eclipse.partial_end?.time),
          obscuration:eclipse.obscuration, peakAltitude:eclipse.peak.altitude};
      }
      eclipse = A.NextLocalSolarEclipse(eclipse.peak.time, observer);
    }
    return null;
  }

  // Primeiro eclipse parcial ou total da Lua com ela acima do horizonte em alguma fase da sombra.
  // O penumbral fica de fora: quase não se nota a olho nu.
  function nextLunar(A, latitude, longitude, from) {
    const observer = new A.Observer(latitude, longitude, 0), until = from + HORIZON_MS;
    let eclipse = A.SearchLunarEclipse(new Date(from));
    for (let guard = 0; eclipse && guard < 60 && ms(eclipse.peak) < until; guard++) {
      if (eclipse.kind === 'partial' || eclipse.kind === 'total') {
        const peak = ms(eclipse.peak), half = eclipse.sd_partial * 60000;
        const moments = [peak - half, peak, peak + half].map(at => A.MakeTime(new Date(at)));
        if (moments.some(time => moonAltitude(A, time, observer) > 0)) {
          return {kind:eclipse.kind, peak, begin:peak - half, end:peak + half,
            totalMinutes:eclipse.kind === 'total' ? Math.round(2 * eclipse.sd_total) : 0};
        }
      }
      eclipse = A.NextLunarEclipse(eclipse.peak);
    }
    return null;
  }

  // O resultado vale para a cidade e o dia (UTC) do pedido; o mesmo dia não recalcula.
  const key = (city, at) => `${city.id}|${new Date(at).toISOString().slice(0, 10)}`;
  const valid = city => city && Number.isFinite(Number(city.lat)) && Number.isFinite(Number(city.lon));
  function peek(city, at = Date.now()) { return valid(city) ? cache.get(key(city, at)) : undefined; }
  function compute(A, city, at) {
    const latitude = Number(city.lat), longitude = Number(city.lon);
    return {solar:nextSolar(A, latitude, longitude, at), lunar:nextLunar(A, latitude, longitude, at)};
  }
  async function request(city, at = Date.now(), {library} = {}) {
    if (!valid(city)) return null;
    const id = key(city, at);
    if (cache.has(id)) return cache.get(id);
    const A = library || await load();
    const result = compute(A, city, at);
    cache.set(id, result);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return result;
  }

  return {load, request, peek, nextSolar, nextLunar, SOURCE};
});
