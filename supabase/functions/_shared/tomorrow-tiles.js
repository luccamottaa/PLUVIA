// Regras puras da função tomorrow-tiles (sem imports, para os testes carregarem). Só telhas que cruzam o Brasil
// (com folga para o mapa arrastado até a fronteira), zoom 3 a 7, e horas cheias de 2 h atrás a 6 h à frente.
export const MIN_ZOOM = 3, MAX_ZOOM = 7, PAST_H = 2, AHEAD_H = 6;
const BOX = { west: -76, east: -28, south: -36, north: 8 };
const lonOf = (x, z) => x / 2 ** z * 360 - 180;
const latOf = (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(Math.sinh(n)); };

export function tileAllowed(z, x, y) {
  if (![z, x, y].every(Number.isInteger) || z < MIN_ZOOM || z > MAX_ZOOM || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) return false;
  const west = lonOf(x, z), east = lonOf(x + 1, z), north = latOf(y, z), south = latOf(y + 1, z);
  return east > BOX.west && west < BOX.east && north > BOX.south && south < BOX.north;
}
// Hora pedida (unix em segundos): hora cheia, de PAST_H atrás a AHEAD_H à frente da hora atual. Fora disso, null.
export function tileTime(value, now = Date.now()) {
  if (typeof value !== 'string' || !/^\d{9,11}$/.test(value)) return null;
  const t = Number(value), hour = Math.floor(now / 3600_000) * 3600;
  if (t % 3600 !== 0 || t < hour - PAST_H * 3600 || t > hour + AHEAD_H * 3600) return null;
  return t;
}
export const tileKey = (z, x, y, t) => `${z}/${x}/${y}/${t}`;
