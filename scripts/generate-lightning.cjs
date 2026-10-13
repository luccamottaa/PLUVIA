#!/usr/bin/env node
// Gera dist/assets/lightning-bolt.svg: um canal longo e ramificado no estilo do Apple Weather
// (pedido do usuário, outubro/2026). Deslocamento do ponto médio com semente fixa, então o arquivo
// só muda quando este script muda. Camadas: halo largo e fraco, brilho médio e núcleo branco fino;
// ramos mais finos e apagados nas pontas. Sem filtro SVG (blur custaria a cada quadro do clarão).
'use strict';
const fs = require('fs');
const path = require('path');

const W = 440, H = 800;
let seed = 20261013;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

// Deslocamento do ponto médio: zigue-zague irregular, mais forte nos trechos longos.
function channel(a, b, rough, depth) {
  if (depth === 0) return [a, b];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
  const off = (rand() - 0.5) * rough * len;
  const t = 0.35 + rand() * 0.3;
  const m = [a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off];
  const left = channel(a, m, rough, depth - 1);
  return left.slice(0, -1).concat(channel(m, b, rough, depth - 1));
}
const d = points => 'M' + points.map(([x, y]) => `${x.toFixed(0)} ${y.toFixed(0)}`).join('L');

// Canal principal: do alto (meio) para baixo e para a esquerda, como no vídeo de referência.
const main = channel([300, 0], [140, 790], 0.3, 7);
const branches = [];
function branch(from, depth, spread, length, level) {
  const i = from;
  const start = main[i];
  const dir = Math.atan2(main[Math.min(i + 3, main.length - 1)][1] - start[1], main[Math.min(i + 3, main.length - 1)][0] - start[0]);
  const angle = dir + spread;
  const end = [start[0] + Math.cos(angle) * length, start[1] + Math.sin(angle) * length];
  const pts = channel(start, end, 0.4, depth);
  branches.push({pts, level});
  // Um sub-ramo curto em parte dos ramos.
  if (level === 1 && rand() > 0.35) {
    const k = Math.floor(pts.length * (0.35 + rand() * 0.3));
    const s = pts[k], a2 = angle + (rand() > 0.5 ? 0.6 : -0.6);
    const e = [s[0] + Math.cos(a2) * length * 0.45, s[1] + Math.sin(a2) * length * 0.45];
    branches.push({pts: channel(s, e, 0.55, 3), level: 2});
  }
}
// Ramos concentrados na metade de baixo, a maioria para a esquerda (como na referência).
for (const [frac, spread, len] of [[0.22, 0.85, 90], [0.41, -0.8, 110], [0.55, 0.7, 170], [0.7, 0.55, 150], [0.84, -0.6, 95]]) {
  branch(Math.floor(main.length * frac), 4, spread, len, 1);
}

const layers = [
  {stroke:'#8fb0ff', main:16, branch:9, opacity:.07},
  {stroke:'#b7ccff', main:7, branch:4, opacity:.2},
  {stroke:'#e4edff', main:3, branch:1.8, opacity:.6},
  {stroke:'#ffffff', main:1.4, branch:.8, opacity:1},
];
const mainPath = d(main);
const branchPaths = branches.map(b => ({d: d(b.pts), level: b.level}));
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" stroke-linecap="round" stroke-linejoin="round">\n`;
svg += `<defs><path id="m" d="${mainPath}"/>`;
branchPaths.forEach((b, i) => { svg += `<path id="b${i}" d="${b.d}"/>`; });
svg += `</defs>\n`;
for (const layer of layers) {
  svg += `<g stroke="${layer.stroke}" opacity="${layer.opacity}">`;
  svg += `<use href="#m" stroke-width="${layer.main}"/>`;
  branchPaths.forEach((b, i) => {
    const w = layer.branch * (b.level === 2 ? 0.6 : 1);
    svg += `<use href="#b${i}" stroke-width="${+w.toFixed(2)}" stroke-opacity="${b.level === 2 ? .55 : .8}"/>`;
  });
  svg += `</g>\n`;
}
svg += `</svg>\n`;
const out = path.join(__dirname, '..', 'dist', 'assets', 'lightning-bolt.svg');
fs.writeFileSync(out, svg);
console.log(out, svg.length, 'bytes');
