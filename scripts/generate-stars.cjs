'use strict';
// Gera os dois tiles do campo estelar decorativo (dist/assets/sky-stars*.svg).
//   node scripts/generate-stars.cjs
// Estilo de céu de app de clima: muitos pontos pequenos em pixels reais (o tile é
// desenhado 1:1 e repete), tamanhos e brilhos variados, poucas estrelas maiores.
// Tiles de tamanhos diferentes (fundo e cintilação) para a repetição não alinhar.
// Não é catálogo nem constelação; a semente fixa deixa a saída reprodutível.
const fs = require('node:fs'), path = require('node:path');
const out = path.resolve(__dirname, '../dist/assets');
const BUDGET = 16000;

function rng(seed) { // mulberry32
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const COLORS = ['#f5f8ff', '#dde8ff', '#fff0dc']; // branca, azulada, quente
const pickColor = random => { const x = random(); return x < .72 ? 0 : x < .9 ? 1 : 2; };
const fmt = value => String(+value.toFixed(2)).replace(/^0\./, '.');

// Pontos espalhados sem aglomerar: distância mínima medida com a volta do tile.
function scatter(random, width, height, count, minDistance, margin, avoid = []) {
  const points = [];
  const far = (x, y, list, distance) => list.every(p => {
    const dx = Math.min(Math.abs(p.x - x), width - Math.abs(p.x - x)), dy = Math.min(Math.abs(p.y - y), height - Math.abs(p.y - y));
    return dx * dx + dy * dy >= distance * distance;
  });
  for (let tries = 0; points.length < count && tries < count * 400; tries++) {
    const x = margin + random() * (width - 2 * margin), y = margin + random() * (height - 2 * margin);
    if (far(x, y, points, minDistance) && far(x, y, avoid, minDistance * 1.5)) points.push({x, y});
  }
  if (points.length < count) throw new Error(`Só coube ${points.length} de ${count} estrelas`);
  return points;
}

function field() {
  const random = rng(20261007), width = 900, height = 1100;
  const points = scatter(random, width, height, 540, 10, 2);
  // Cada estrela é um ponto (subcaminho de comprimento zero com ponta redonda):
  // ~10 bytes por estrela. Tamanho e brilho andam juntos, em faixas discretas.
  const SIZES = [[1.1, .45], [1.4, .55], [1.8, .7], [2.3, .82], [2.9, .95]]; // diâmetro px, opacidade
  const groups = new Map();
  for (const point of points) {
    const roll = random();
    // ~45% pontinhos, ~30% pequenos, ~15% médios, ~7% claros, ~3% evidentes.
    const size = roll < .45 ? 0 : roll < .75 ? 1 : roll < .9 ? 2 : roll < .97 ? 3 : 4;
    const dim = size < 3 && random() < .35 ? .7 : 1; // parte some no fundo, como no céu real
    const key = `${size}|${dim}|${pickColor(random)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(`M${Math.round(point.x)} ${Math.round(point.y)}h0`);
  }
  const body = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([key, dots]) => {
    const [size, dim, color] = key.split('|');
    const [diameter, opacity] = SIZES[size];
    return `<path stroke="${COLORS[color]}" stroke-width="${fmt(diameter)}" opacity="${fmt(opacity * dim)}" d="${dots.join('')}"/>`;
  }).join('');
  return {svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" stroke-linecap="round">${body}</svg>`, points};
}

function shimmer() {
  // Poucas estrelas mais brilhantes, com halo curto; só a opacidade delas cintila.
  const random = rng(7), width = 1040, height = 1280;
  const points = scatter(random, width, height, 22, 140, 6);
  const stars = points.map(point => {
    const x = Math.round(point.x), y = Math.round(point.y), r = 1.2 + random() * .5;
    return `<circle cx="${x}" cy="${y}" r="${fmt(r * 3)}" fill="url(#g)"/><circle cx="${x}" cy="${y}" r="${fmt(r)}" fill="${COLORS[pickColor(random)]}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><radialGradient id="g"><stop stop-color="#eef3ff" stop-opacity=".45"/><stop offset=".35" stop-color="#eef3ff" stop-opacity=".12"/><stop offset="1" stop-color="#eef3ff" stop-opacity="0"/></radialGradient></defs>${stars}</svg>`;
}

const files = {'sky-stars.svg': field().svg + '\n', 'sky-stars-shimmer.svg': shimmer() + '\n'};
const total = Object.values(files).reduce((sum, text) => sum + Buffer.byteLength(text), 0);
if (total >= BUDGET) throw new Error(`Campo estelar com ${total} bytes, acima do orçamento de ${BUDGET}`);
for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(out, name), text);
console.log(`Estrelas gravadas: ${Object.entries(files).map(([n, t]) => `${n} ${Buffer.byteLength(t)} B`).join(', ')} (total ${total} B).`);
