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
// ---------------------------------------------------------------------------------------------------------
// Força e duração da chuva pelo radar (novembro/2026, "avisos inteligentes", só no servidor). As telhas usam o
// esquema de cores 2 ("Universal Blue"); cada cor é um valor de refletividade (dBZ) pela tabela oficial do
// RainViewer (rainviewer.com/files/rainviewer_api_colors_table.csv, de -4 dBZ, o primeiro acima de ALPHA, a
// 65). Conferido com telhas reais: as cores servidas são as da tabela (±1 por arredondamento do alfa).
const PALETTE = ('75706234,78736439,7c75653e,7f786744,827b6949,857d6a4e,88806c54,8b826d59,8e856f5e,92887164,9e93756e,' +
  'aa9e7978,b6a97e82,c2b4828c,cec08796,d2c48ba0,d6c88faa,dacc93b4,ded097be,88ddeeff,6cd1ebff,51c5e8ff,36bae5ff,1baee2ff,' +
  '00a3e0ff,009ad5ff,0091caff,0088bfff,007fb4ff,0077aaff,0070a3ff,00699cff,006295ff,005b8eff,005588ff,005180ff,004e78ff,' +
  '004a70ff,004768ff,ffee00ff,ffe000ff,ffd200ff,ffc500ff,ffb700ff,ffaa00ff,ff9f00ff,ff9500ff,ff8b00ff,ff8100ff,ff4400ff,' +
  'f23600ff,e62800ff,d91b00ff,cd0d00ff,c10000ff,a80000ff,8f0000ff,760000ff,5d0000ff,ffaaffff,ff9fffff,ff95ffff,ff8bffff,' +
  'ff81ffff,ff77ffff,ff6cffff,ff62ffff,ff58ffff,ff4effff,ffffffff').split(',').map((hex, index) => ({
  dbz:index - 4, rgba:[0, 2, 4, 6].map(at => parseInt(hex.slice(at, at + 2), 16)),
}));
export const DRY = -128, WET = 0.25;
// Chuva fraca < 30 dBZ (~2,5 mm/h); forte ≥ 37 (~7,5 mm/h, o mesmo limite do "Vai chover?"); núcleo de
// tempestade ≥ 50 (~50 mm/h, granizo e raios prováveis). mm/h por Marshall-Palmer (Z = 200 R^1,6).
export const MODERATE_DBZ = 30, HEAVY_DBZ = 37, STORM_DBZ = 50;
const colorCache = new Map();
export function dbzOf(r, g, b, a) {
  if (a <= ALPHA) return DRY;
  const key = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
  let value = colorCache.get(key);
  if (value === undefined) {
    let best = Infinity;
    for (const entry of PALETTE) {
      const [pr, pg, pb, pa] = entry.rgba, distance = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2 + (pa - a) ** 2;
      if (distance < best) { best = distance; value = entry.dbz; }
    }
    colorCache.set(key, value);
  }
  return value;
}
export const mmPerHour = dbz => dbz === null || dbz === DRY ? 0 : Math.round((10 ** (dbz / 10) / 200) ** (1 / 1.6) * 10) / 10;
export const category = dbz => dbz === null || dbz === DRY ? null : dbz >= STORM_DBZ ? "storm" : dbz >= HEAVY_DBZ ? "heavy" : dbz >= MODERATE_DBZ ? "moderate" : "weak";

// Grade de dBZ da janela (DRY onde não há eco), montada das telhas decodificadas como windowMask.
export function windowDbz(decoded) {
  const out = new Int8Array(SIZE * SIZE).fill(DRY);
  for (const {ox, oy, rgba} of decoded) {
    for (let y = 0; y < 256; y += 1) {
      const wy = oy + y; if (wy < 0 || wy >= SIZE) continue;
      for (let x = 0; x < 256; x += 1) {
        const wx = ox + x; if (wx < 0 || wx >= SIZE) continue;
        const i = (y * 256 + x) * 4;
        if (rgba[i + 3] > ALPHA) out[wy * SIZE + wx] = dbzOf(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
      }
    }
  }
  return out;
}
// A mesma máscara de windowMask (eco = alfa acima de ALPHA), tirada da grade de dBZ.
export const maskOf = grid => Uint8Array.from(grid, value => value === DRY ? 0 : 1);

// Janela da cidade com a grade deslocada por (dx, dy): fração com eco (entre os pixels que a janela ainda
// enxerga), intensidade típica do trecho que cobre a cidade (percentil 90 dos pixels com eco, para um pixel
// isolado não virar tempestade) e se a projeção ainda é conhecida (metade da origem dentro da janela).
export function cityIntensity(grid, size = SIZE, dx = 0, dy = 0, radius = CITY_RADIUS) {
  const values = []; let total = 0, inside = 0;
  for (let y = CENTER - radius; y <= CENTER + radius; y += 1) for (let x = CENTER - radius; x <= CENTER + radius; x += 1) {
    const sx = Math.round(x - dx), sy = Math.round(y - dy);
    total += 1;
    if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
    inside += 1;
    const value = grid[sy * size + sx];
    if (value !== DRY) values.push(value);
  }
  values.sort((a, b) => a - b);
  return {coverage:inside ? values.length / inside : 0, dbz:values.length ? values[Math.floor((values.length - 1) * 0.9)] : null, known:inside / total >= 0.5};
}
// Movimento entre as duas imagens, em pixels por passo de 10 min (o mesmo cálculo de estimate).
export function track(previous, current, size = SIZE, gapSeconds = FRAME_GAP_S, lat = 0) {
  const coarse = motion(half(previous, size), half(current, size), size / 2, MAX_SHIFT / 2);
  if (!coarse) return null;
  const dx = coarse.dx * 2, dy = coarse.dy * 2, factor = STEP_MIN * 60 / gapSeconds;
  const kmPerPixel = 156.543 * Math.cos(lat * Math.PI / 180) / 2 ** ZOOM;
  return {perStep:{dx:dx * factor, dy:dy * factor}, speedKmh:Math.round(Math.hypot(dx, dy) * kmPerPixel * 3600 / gapSeconds), score:Math.round(coarse.score * 100) / 100};
}
export const OUTLOOK_STEPS = 12;
// Leitura completa para a cidade: agora, 20 min atrás e a projeção de 10 em 10 min por até 2 h (para quando a
// origem sai da janela). Sem movimento claro, só agora e antes.
export function outlook(previousGrid, currentGrid, size = SIZE, gapSeconds = FRAME_GAP_S, lat = 0) {
  const moving = track(maskOf(previousGrid), maskOf(currentGrid), size, gapSeconds, lat);
  const steps = [];
  if (moving) for (let step = 1; step <= OUTLOOK_STEPS; step += 1) {
    const at = cityIntensity(currentGrid, size, moving.perStep.dx * step, moving.perStep.dy * step);
    if (!at.known) break;
    steps.push({minutes:step * STEP_MIN, ...at});
  }
  return {track:moving, now:cityIntensity(currentGrid, size), before:cityIntensity(previousGrid, size), steps};
}
const wetAt = point => point && point.coverage >= WET && point.dbz !== null;
// Chuva que chega: força (o pico do trecho que passa pela cidade na primeira hora de chuva) e duração (passos
// seguidos com chuva). open = a projeção acabou ainda chovendo (dura pelo menos durationMin).
export function incomingDetail(view, arrivalMin) {
  const start = view?.steps?.findIndex(point => point.minutes >= arrivalMin && wetAt(point)) ?? -1;
  if (start < 0) return null;
  let end = start;
  while (end + 1 < view.steps.length && wetAt(view.steps[end + 1])) end += 1;
  const peak = Math.max(...view.steps.slice(start, Math.min(end, start + 5) + 1).map(point => point.dbz));
  return {intensity:category(peak), peakDbz:peak, mmH:mmPerHour(peak), durationMin:(end - start + 1) * STEP_MIN, open:end === view.steps.length - 1};
}
// Já chove (radar ou observação) e um trecho bem mais forte chega nos próximos 10 a 30 min: "vai engrossar".
export function worsening(view, raining = false) {
  if (!view?.track || !(wetAt(view.now) || raining)) return null;
  const base = wetAt(view.now) ? view.now.dbz : MODERATE_DBZ - 5;
  if (base >= HEAVY_DBZ) return null;
  const hit = view.steps.slice(0, 3).find(point => wetAt(point) && point.dbz >= HEAVY_DBZ && point.dbz - base >= 6);
  return hit ? {minutes:hit.minutes, intensity:category(hit.dbz), peakDbz:hit.dbz, mmH:mmPerHour(hit.dbz), fromDbz:wetAt(view.now) ? view.now.dbz : null} : null;
}
// Chovia forte sobre a cidade (agora ou 20 min atrás) e os próximos 30 min ficam fracos ou secos: "o pior já
// passou". stopsIn = primeiro passo sem chuva, quando há.
export function easing(view) {
  if (!view?.track || view.steps.length < 3) return null;
  const strong = [view.now, view.before].filter(wetAt).map(point => point.dbz);
  if (!strong.length || Math.max(...strong) < HEAVY_DBZ) return null;
  const next = view.steps.slice(0, 3);
  if (!next.every(point => !wetAt(point) || point.dbz < MODERATE_DBZ)) return null;
  const dry = view.steps.find(point => !wetAt(point));
  return {fromDbz:Math.max(...strong), stopsIn:dry ? dry.minutes : null};
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
