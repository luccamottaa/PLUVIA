// Núcleo do "chuva a caminho" pelo radar para o servidor (push-process). Mesmas funções e limites de
// dist/modules/radar-nowcast.js (o app); tests/radar-nowcast.test.cjs confere que os dois dão o mesmo
// resultado. Funções puras: quem chama baixa as telhas e decodifica o PNG.
export const ZOOM = 7, SIZE = 160, CENTER = SIZE / 2, CITY_RADIUS = 4, ALPHA = 48;
export const FRAME_GAP_S = 1200, MAX_SHIFT = 24, STEPS = 6, STEP_MIN = 10;
const MIN_ECHO = 12, MIN_SCORE = 0.35;

export function mask(rgba, width, height, alpha = ALPHA) {
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i += 1) out[i] = rgba[i * 4 + 3] > alpha ? 1 : 0;
  return out;
}
const count = (m) => { let n = 0; for (let i = 0; i < m.length; i += 1) n += m[i]; return n; };
// Fração da janela da cidade com eco depois de deslocar a mancha por (dx, dy).
export function cityCoverage(m, size, dx = 0, dy = 0, radius = CITY_RADIUS) {
  let wet = 0, total = 0;
  for (let y = CENTER - radius; y <= CENTER + radius; y += 1) for (let x = CENTER - radius; x <= CENTER + radius; x += 1) {
    const sx = Math.round(x - dx), sy = Math.round(y - dy);
    total += 1;
    if (sx >= 0 && sy >= 0 && sx < size && sy < size && m[sy * size + sx]) wet += 1;
  }
  return wet / total;
}
// Deslocamento (em pixels por intervalo) que leva a mancha anterior à atual com a maior sobreposição.
export function motion(previous, current, size, maxShift = MAX_SHIFT) {
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
export function arrival(current, size, perStep) {
  if (!perStep || cityCoverage(current, size) >= 0.25) return null;
  for (let step = 1; step <= STEPS; step += 1) {
    if (cityCoverage(current, size, perStep.dx * step, perStep.dy * step) >= 0.25) return step * STEP_MIN;
  }
  return null;
}
// Grade com metade da resolução (célula com eco se 2 dos 4 pixels têm eco): a busca do movimento cai de
// ~50 milhões para ~3 milhões de comparações, alguns milissegundos no celular.
export function half(m, size) {
  const out = new Uint8Array((size / 2) * (size / 2));
  for (let y = 0; y < size / 2; y += 1) for (let x = 0; x < size / 2; x += 1) {
    const i = y * 2 * size + x * 2;
    out[y * (size / 2) + x] = m[i] + m[i + 1] + m[i + size] + m[i + size + 1] >= 2 ? 1 : 0;
  }
  return out;
}
export function estimate(previous, current, size = SIZE, gapSeconds = FRAME_GAP_S, lat = 0) {
  const coarse = motion(half(previous, size), half(current, size), size / 2, MAX_SHIFT / 2);
  if (!coarse) return null;
  const shift = {dx:coarse.dx * 2, dy:coarse.dy * 2, score:coarse.score};
  const perStep = {dx:shift.dx * (STEP_MIN * 60 / gapSeconds), dy:shift.dy * (STEP_MIN * 60 / gapSeconds)};
  const minutes = arrival(current, size, perStep);
  if (minutes === null) return null;
  const kmPerPixel = 156.543 * Math.cos(lat * Math.PI / 180) / 2 ** ZOOM;
  const speedKmh = Math.round(Math.hypot(shift.dx, shift.dy) * kmPerPixel * 3600 / gapSeconds);
  return {minutes, speedKmh, score:Math.round(shift.score * 100) / 100};
}
export function pixelOf(lon, lat, z = ZOOM) {
  const n = 256 * 2 ** z, rad = Number(lat) * Math.PI / 180;
  return {x:(Number(lon) + 180) / 360 * n, y:(1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n};
}

// Telhas de 256 px que a janela de 160 × 160 em volta da cidade cruza (até 4), com a posição de cada uma.
export function windowTiles(lon, lat) {
  const {x, y} = pixelOf(lon, lat);
  const left = Math.round(x) - CENTER, top = Math.round(y) - CENTER, tiles = [];
  for (let ty = Math.floor(top / 256); ty <= Math.floor((top + SIZE - 1) / 256); ty += 1)
    for (let tx = Math.floor(left / 256); tx <= Math.floor((left + SIZE - 1) / 256); tx += 1) tiles.push({tx, ty, ox:tx * 256 - left, oy:ty * 256 - top});
  return tiles;
}
// Monta a máscara da janela a partir das telhas já decodificadas em RGBA (256 × 256).
export function windowMask(decoded) {
  const out = new Uint8Array(SIZE * SIZE);
  for (const {ox, oy, rgba} of decoded) {
    for (let y = 0; y < 256; y += 1) {
      const wy = oy + y; if (wy < 0 || wy >= SIZE) continue;
      for (let x = 0; x < 256; x += 1) {
        const wx = ox + x; if (wx < 0 || wx >= SIZE) continue;
        if (rgba[(y * 256 + x) * 4 + 3] > ALPHA) out[wy * SIZE + wx] = 1;
      }
    }
  }
  return out;
}
