/* "A chuva chega em ~X min" pelo radar (pedido do dono, outubro/2026). Extrapolação simples e conhecida:
   compara as duas imagens do RainViewer com 20 min de diferença numa janela de 160 × 160 pixels em volta da
   cidade (zoom 7, ~1,2 km por pixel no equador, ~±95 km), acha o deslocamento que melhor sobrepõe as
   manchas de chuva e empurra a mancha atual nesse ritmo por até 60 min. Se a janela de 9 × 9 pixels da
   cidade (a mesma de radar-probe) ficar com eco em pelo menos um quarto, essa é a chegada.
   Só fala quando o movimento é claro: eco suficiente nas duas imagens, sobreposição boa e deslocamento
   dentro da busca. Não prevê intensidade, não diz "não vai chover" e não substitui chuva observada. Roda só
   quando o modelo já indica chance de chuva ou o radar já vê chuva em cima da cidade (app.js), com cliente
   próprio e cache de 10 min por cidade. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).nowcast = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (scope) {
  'use strict';
  const ZOOM = 7, SIZE = 160, CENTER = SIZE / 2, CITY_RADIUS = 4, ALPHA = 48;
  const FRAME_GAP_S = 1200, MAX_SHIFT = 24, STEPS = 6, STEP_MIN = 10;
  const MIN_ECHO = 12, MIN_SCORE = 0.35, TTL_MS = 10 * 60_000, MAX_FRAME_AGE_MS = 20 * 60_000;
  const cache = new Map();

  function mask(rgba, width, height, alpha = ALPHA) {
    const out = new Uint8Array(width * height);
    for (let i = 0; i < out.length; i += 1) out[i] = rgba[i * 4 + 3] > alpha ? 1 : 0;
    return out;
  }
  const count = (m) => { let n = 0; for (let i = 0; i < m.length; i += 1) n += m[i]; return n; };
  // Fração da janela da cidade com eco depois de deslocar a mancha por (dx, dy).
  function cityCoverage(m, size, dx = 0, dy = 0, radius = CITY_RADIUS) {
    let wet = 0, total = 0;
    for (let y = CENTER - radius; y <= CENTER + radius; y += 1) for (let x = CENTER - radius; x <= CENTER + radius; x += 1) {
      const sx = Math.round(x - dx), sy = Math.round(y - dy);
      total += 1;
      if (sx >= 0 && sy >= 0 && sx < size && sy < size && m[sy * size + sx]) wet += 1;
    }
    return wet / total;
  }
  // Deslocamento (em pixels por intervalo) que leva a mancha anterior à atual com a maior sobreposição.
  function motion(previous, current, size, maxShift = MAX_SHIFT) {
    const echo = count(current), before = count(previous);
    if (echo < MIN_ECHO || before < MIN_ECHO) return null;
    let best = null;
    for (let dy = -maxShift; dy <= maxShift; dy += 1) for (let dx = -maxShift; dx <= maxShift; dx += 1) {
      let hits = 0;
      for (let y = Math.max(0, dy); y < Math.min(size, size + dy); y += 1) {
        const row = y * size, prevRow = (y - dy) * size;
        for (let x = Math.max(0, dx); x < Math.min(size, size + dx); x += 1) if (current[row + x] && previous[prevRow + x - dx]) hits += 1;
      }
      if (!best || hits > best.hits || (hits === best.hits && Math.hypot(dx, dy) < Math.hypot(best.dx, best.dy))) best = {dx, dy, hits};
    }
    const score = best.hits / Math.min(echo, before);
    if (score < MIN_SCORE || Math.abs(best.dx) >= maxShift || Math.abs(best.dy) >= maxShift) return null;
    return {dx:best.dx, dy:best.dy, score};
  }
  // Minutos (a partir da imagem atual) até a mancha cobrir a cidade, ou null em até 60 min / cidade já molhada.
  function arrival(current, size, perStep) {
    if (!perStep || cityCoverage(current, size) >= 0.25) return null;
    for (let step = 1; step <= STEPS; step += 1) {
      if (cityCoverage(current, size, perStep.dx * step, perStep.dy * step) >= 0.25) return step * STEP_MIN;
    }
    return null;
  }
  // Grade com metade da resolução (célula com eco se 2 dos 4 pixels têm eco): a busca do movimento cai de
  // ~50 milhões para ~3 milhões de comparações, alguns milissegundos no celular.
  function half(m, size) {
    const out = new Uint8Array((size / 2) * (size / 2));
    for (let y = 0; y < size / 2; y += 1) for (let x = 0; x < size / 2; x += 1) {
      const i = y * 2 * size + x * 2;
      out[y * (size / 2) + x] = m[i] + m[i + 1] + m[i + size] + m[i + size + 1] >= 2 ? 1 : 0;
    }
    return out;
  }
  // Deslocamento da chuva a cada 10 min (pixels), ou null sem movimento claro.
  function stepFor(previous, current, size = SIZE, gapSeconds = FRAME_GAP_S) {
    const coarse = motion(half(previous, size), half(current, size), size / 2, MAX_SHIFT / 2);
    if (!coarse) return null;
    const shift = {dx:coarse.dx * 2, dy:coarse.dy * 2, score:coarse.score};
    return {shift, perStep:{dx:shift.dx * (STEP_MIN * 60 / gapSeconds), dy:shift.dy * (STEP_MIN * 60 / gapSeconds)}};
  }
  function estimate(previous, current, size = SIZE, gapSeconds = FRAME_GAP_S, lat = 0) {
    const step = stepFor(previous, current, size, gapSeconds);
    if (!step) return null;
    const {shift, perStep} = step;
    const minutes = arrival(current, size, perStep);
    if (minutes === null) return null;
    const kmPerPixel = 156.543 * Math.cos(lat * Math.PI / 180) / 2 ** ZOOM;
    const speedKmh = Math.round(Math.hypot(shift.dx, shift.dy) * kmPerPixel * 3600 / gapSeconds);
    return {minutes, speedKmh, score:Math.round(shift.score * 100) / 100};
  }
  // Frase do "Vai chover?" a partir da chegada já descontado o tempo desde a imagem.
  function answer(result, now = Date.now()) {
    if (!result || !Number.isFinite(result.frameAt) || !Number.isFinite(result.minutes)) return null;
    const age = (now - result.frameAt) / 60_000;
    if (age > MAX_FRAME_AGE_MS / 60_000) return null;
    const left = result.minutes - age;
    if (left < 5) return null;
    const when = left <= 12 ? 'nos próximos 10 min' : `em cerca de ${Math.round(left / 5) * 5} min`;
    return {tone:'rain', nowcast:true, text:`Chuva a caminho pelo radar: deve chegar ${when}, pelo movimento das últimas imagens.`};
  }

  // "Próxima hora" (pedido do dono, outubro/2026, inspirado no Apple Weather): a fração da área da cidade com
  // chuva a cada 5 min, de agora até 60 min, empurrando a mancha da imagem mais recente no ritmo medido.
  // Cobertura, não intensidade: o RainViewer público não dá mm/h confiável. Sem movimento claro, sem chuva na
  // hora inteira ou com imagem velha, null (a seção some).
  function nextHour(result, now = Date.now()) {
    if (!result?.mask || !result.perStep || !Number.isFinite(result.frameAt)) return null;
    const age = (now - result.frameAt) / 60_000;
    if (age < 0 || age > MAX_FRAME_AGE_MS / 60_000) return null;
    const points = [];
    for (let minutes = 0; minutes <= 60; minutes += 5) {
      const k = (minutes + age) / STEP_MIN;
      points.push({minutes, coverage:Math.round(cityCoverage(result.mask, SIZE, result.perStep.dx * k, result.perStep.dy * k) * 100) / 100});
    }
    const wet = point => point.coverage >= 0.25;
    if (!points.some(wet)) return null;
    let text;
    if (wet(points[0])) {
      const stop = points.findIndex(point => !wet(point));
      text = stop < 0 ? 'Pelo radar, a chuva segue a próxima hora toda.' : `Pelo radar, a chuva deve diminuir em cerca de ${points[stop].minutes} min.`;
    } else {
      const start = points.findIndex(wet), end = points.findIndex((point, index) => index > start && !wet(point));
      text = `Pelo radar, a chuva chega em cerca de ${points[start].minutes} min` + (end > 0 ? ` e dura cerca de ${points[end].minutes - points[start].minutes} min.` : ' e segue até o fim da hora.');
    }
    return {points, text, frameAt:result.frameAt};
  }

  function pixelOf(lon, lat, z = ZOOM) {
    const n = 256 * 2 ** z, rad = Number(lat) * Math.PI / 180;
    return {x:(Number(lon) + 180) / 360 * n, y:(1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n};
  }
  // Janela de 160 × 160 em volta da cidade, montada com as telhas que ela cruza (até 4).
  async function windowMask(host, path, city, signal) {
    const load = scope.PLUVIA?.radar?.loadImage, doc = scope.document;
    if (!load || !doc) throw new Error('unsupported');
    const {x, y} = pixelOf(city.lon, city.lat);
    const left = Math.round(x) - CENTER, top = Math.round(y) - CENTER;
    const canvas = doc.createElement('canvas'); canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    const tiles = [];
    for (let ty = Math.floor(top / 256); ty <= Math.floor((top + SIZE - 1) / 256); ty += 1)
      for (let tx = Math.floor(left / 256); tx <= Math.floor((left + SIZE - 1) / 256); tx += 1) tiles.push({tx, ty});
    const images = await Promise.all(tiles.map(({tx, ty}) => load(`${host}${path}/256/${ZOOM}/${tx}/${ty}/2/1_1.png`, signal)));
    images.forEach((image, index) => ctx.drawImage(image, tiles[index].tx * 256 - left, tiles[index].ty * 256 - top));
    return mask(ctx.getImageData(0, 0, SIZE, SIZE).data, SIZE, SIZE);
  }
  let client = null;
  async function check(city, {signal, now = Date.now()} = {}) {
    const id = String(city?.id || '');
    if (!id || !Number.isFinite(Number(city.lat)) || !Number.isFinite(Number(city.lon))) return null;
    const hit = cache.get(id);
    if (hit && now - hit.at < TTL_MS) return hit.result;
    client ||= scope.PLUVIA?.http?.createClient?.({defaultTimeoutMs:8000}) || null;
    if (!client?.getJson) return null;
    const meta = await client.getJson('https://api.rainviewer.com/public/weather-maps.json', {signal, timeoutMs:8000, cache:'no-store'});
    const past = Array.isArray(meta?.radar?.past) ? meta.radar.past : [];
    const latest = past[past.length - 1];
    const earlier = latest && past.find(frame => frame.time === latest.time - FRAME_GAP_S);
    const host = latest?.host || meta?.host;
    let result = null;
    if (latest?.path && earlier?.path && host && now - latest.time * 1000 <= MAX_FRAME_AGE_MS) {
      const [before, after] = await Promise.all([windowMask(host, earlier.path, city, signal), windowMask(host, latest.path, city, signal)]);
      const step = stepFor(before, after, SIZE, FRAME_GAP_S);
      const found = step ? estimate(before, after, SIZE, FRAME_GAP_S, Number(city.lat)) : null;
      // A máscara atual e o passo ficam para o gráfico da próxima hora, que se refaz a cada minuto sem nova consulta.
      result = step ? {...(found || {minutes:null}), perStep:step.perStep, mask:after, frameAt:latest.time * 1000, cityId:id} : null;
    }
    cache.delete(id); cache.set(id, {at:now, result});
    while (cache.size > 12) cache.delete(cache.keys().next().value);
    return result;
  }

  return {SIZE, CENTER, mask, half, cityCoverage, motion, arrival, stepFor, estimate, answer, nextHour, check, clear:() => cache.clear()};
});
