/* Próximos eclipses do Sol e da Lua visíveis da cidade aberta. Os cálculos são do Astronomy Engine
   (MIT, vendor/astronomy-2.1.19.min.js), carregado só quando "Mais sobre o céu" abre: nada de fetch
   externo nem timer; o único DOM é a ilustração pequena de cada eclipse (figure). app.js lê o resultado guardado no relógio central e pede o cálculo
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
            totalMinutes:eclipse.kind === 'total' ? Math.round(2 * eclipse.sd_total) : 0,
            obscuration:Number.isFinite(eclipse.obscuration) ? eclipse.obscuration : null};
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

  // Ilustração (não é posição real no céu): fração do disco de raio 1 coberta por outro disco de raio r
  // a distância d dos centros, e a distância que dá uma fração pedida (o disco do eclipse parcial para
  // exatamente na porcentagem calculada para a cidade).
  function overlapFraction(d, r) {
    if (d >= 1 + r) return 0;
    if (d <= Math.abs(1 - r)) return Math.min(1, r * r);
    const a = Math.acos((d * d + 1 - r * r) / (2 * d)), b = Math.acos((d * d + r * r - 1) / (2 * d * r));
    const lens = a + r * r * b - .5 * Math.sqrt(Math.max(0, (-d + 1 + r) * (d + 1 - r) * (d - 1 + r) * (d + 1 + r)));
    return lens / Math.PI;
  }
  function distanceFor(fraction, r) {
    let near = Math.abs(1 - r), far = 1 + r;
    const target = Math.min(Math.max(fraction, 0), overlapFraction(near, r));
    for (let step = 0; step < 40; step++) { const mid = (near + far) / 2; if (overlapFraction(mid, r) > target) near = mid; else far = mid; }
    return (near + far) / 2;
  }
  const UMBRA = 2.6; // raio da sombra da Terra na distância da Lua, em raios lunares (aproximado)
  // Sol: a Lua (escura, só visível sobre o disco) desliza até cobrir a fração local; anel no anular.
  // Lua: a sombra da Terra desliza sobre o disco; no total, a Lua inteira fica avermelhada.
  function figureModel(type, info) {
    const fraction = Number.isFinite(info?.obscuration) ? info.obscuration : type === 'lunar' && info?.kind === 'total' ? 1 : .5;
    if (type === 'solar') {
      if (info?.kind === 'total') return {mover:'moon', r:1.04, to:0, from:-2.2, tone:'total'};
      if (info?.kind === 'annular') return {mover:'moon', r:Math.sqrt(Math.min(.98, Math.max(.5, fraction))), to:0, from:-2.1, tone:'annular'};
      return {mover:'moon', r:1, to:-distanceFor(fraction, 1), from:-2.15, tone:'partial'};
    }
    if (info?.kind === 'total') return {mover:'umbra', r:UMBRA, to:-.8, from:-(UMBRA + 1.15), tone:'total'};
    return {mover:'umbra', r:UMBRA, to:-distanceFor(fraction, UMBRA), from:-(UMBRA + 1.15), tone:'partial'};
  }
  const SVG = 'http://www.w3.org/2000/svg', RADIUS = 34;
  function figure(doc, type, info) {
    const model = figureModel(type, info), node = (name, attrs) => {
      const el = doc.createElementNS(SVG, name);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
      return el;
    };
    const svg = node('svg', {viewBox:'0 0 80 80', class:`eclipse-figure eclipse-${type}`, 'aria-hidden':'true', focusable:'false', 'data-tone':model.tone});
    const clip = `pluviaEclipse${type === 'solar' ? 'Sun' : 'Moon'}`;
    const defs = node('defs', {}), clipPath = node('clipPath', {id:clip});
    clipPath.append(node('circle', {cx:40, cy:40, r:RADIUS})); defs.append(clipPath); svg.append(defs);
    if (type === 'solar') svg.append(node('circle', {class:'eclipse-glow', cx:40, cy:40, r:RADIUS + 5}), node('circle', {class:'eclipse-sun', cx:40, cy:40, r:RADIUS}));
    else svg.append(node('use', {href:'#pluviaMoonSurface', class:'eclipse-moon-surface', 'clip-path':`url(#${clip})`}), node('circle', {class:'eclipse-moon-rim', cx:40, cy:40, r:RADIUS}));
    const group = node('g', {'clip-path':`url(#${clip})`});
    const mover = node('circle', {class:`eclipse-mover eclipse-${model.mover}`, cx:40, cy:40, r:(model.r * RADIUS).toFixed(2)});
    mover.style.setProperty('--eclipse-from', `${(model.from * RADIUS).toFixed(2)}px`);
    mover.style.setProperty('--eclipse-to', `${(model.to * RADIUS).toFixed(2)}px`);
    group.append(mover); svg.append(group);
    return svg;
  }

  return {load, request, peek, nextSolar, nextLunar, overlapFraction, distanceFor, figureModel, figure, SOURCE};
});
