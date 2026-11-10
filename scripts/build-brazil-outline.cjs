#!/usr/bin/env node
/* Gera dist/modules/brazil-outline.js (contorno do Brasil do "Brasil agora") a partir do Natural Earth.
   Só módulos do Node 24, sem dependências:

     node scripts/build-brazil-outline.cjs --source <arquivo ou URL do ne_10m_admin_0_countries.geojson>

   Fonte padrão: Natural Earth 1:10m, admin 0 (países), v5.1.2, domínio público. O GeoJSON bruto tem 13 MB e não
   entra no repositório; só o resultado simplificado. Passos:
   1. extrai o Brasil (ADM0_A3 = BRA);
   2. simplifica cada anel com Douglas-Peucker num plano equirretangular (longitude × cos da latitude central),
      o mesmo tipo de projeção do mapa, para a tolerância valer igual nos dois eixos;
   3. descarta ilhas menores que a área mínima, exceto as que têm uma capital (Vitória fica numa ilha de 89 km²);
   4. arredonda e confere as 27 capitais de dist/capitals.js: cada uma dentro do contorno ou, no máximo, a
      COAST_TOLERANCE_KM da linha de costa; senão, falha.
   Por que a tolerância de costa: os pontos de referência de Belém, Florianópolis, São Luís e Vitória ficam na orla e,
   já no Natural Earth 10m bruto (antes de simplificar), caem 0,4 a 1,2 km dentro d'água. A malha do IBGE tem o mesmo
   efeito (na qualidade máxima o Rio fica fora). 3 km é menos de meio pixel no mapa do celular; um erro como o antigo
   (etiquetas a centenas de km do ponto) continua sendo pego. Rodar de novo só quando mudar a fonte ou os parâmetros. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

const DEFAULT_SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_admin_0_countries.geojson';
// ~2,2 km: menos de 0,3 px no maior mapa (520 px de largura, ~13 px por grau), então a costa do Nordeste, a Baía de
// Todos os Santos, a Guanabara e a Lagoa dos Patos ficam iguais ao original; 11 mil pontos viram ~2 mil (31 KB).
const DEFAULT_TOLERANCE = 0.02;
// ~250 km²: some com Fernando de Noronha, Trindade e os rochedos (pontos invisíveis no mapa); fica Marajó, Ilha Grande etc.
const DEFAULT_MIN_AREA = 0.02;
const DECIMALS = 3; // ~110 m: bem abaixo da tolerância, sem custo visível
const COAST_TOLERANCE_KM = 3;
const KM_PER_DEGREE = 111.32;
const repo = path.resolve(__dirname, '..');

function args(argv) {
  const out = {source:DEFAULT_SOURCE, tolerance:DEFAULT_TOLERANCE, minArea:DEFAULT_MIN_AREA, out:path.join(repo, 'dist/modules/brazil-outline.js')};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, ''), value = argv[i + 1];
    if (key === 'source') out.source = value;
    else if (key === 'tolerance') out.tolerance = Number(value);
    else if (key === 'min-area') out.minArea = Number(value);
    else if (key === 'out') out.out = path.resolve(value);
    else throw new Error(`Opção desconhecida: ${argv[i]}`);
  }
  if (!(out.tolerance > 0) || !(out.minArea >= 0)) throw new Error('Tolerância e área mínima precisam ser números positivos.');
  return out;
}

async function readSource(source) {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`HTTP ${response.status} em ${source}`);
    return response.json();
  }
  return JSON.parse(fs.readFileSync(source, 'utf8'));
}

function loadCapitals() {
  const context = vm.createContext({Intl, localStorage:{getItem:() => null, setItem() {}}});
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(path.join(repo, 'dist/capitals.js'), 'utf8'), context);
  return vm.runInContext('CAPITALS', context);
}

// Distância de p ao segmento ab, no plano já corrigido por cos(lat).
function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// Douglas-Peucker iterativo (pilha, sem recursão: anéis do Natural Earth 10m passam de 20 mil pontos).
function simplifyLine(points, tolerance) {
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let worst = -1, index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistance(points[i], points[first], points[last]);
      if (d > worst) {worst = d; index = i;}
    }
    if (worst > tolerance) {keep[index] = 1; stack.push([first, index], [index, last]);}
  }
  return points.filter((_, i) => keep[i]);
}

// Anel fechado: corta no ponto mais distante do primeiro e simplifica as duas metades (o primeiro ponto repetido
// no fim deixaria o segmento base com comprimento zero).
function simplifyRing(ring, tolerance, k) {
  const open = ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring.slice();
  const flat = open.map(([lon, lat]) => [lon * k, lat]);
  let far = 0, best = -1;
  flat.forEach((p, i) => {const d = Math.hypot(p[0] - flat[0][0], p[1] - flat[0][1]); if (d > best) {best = d; far = i;}});
  const a = simplifyLine(flat.slice(0, far + 1), tolerance), b = simplifyLine(flat.slice(far).concat([flat[0]]), tolerance);
  return a.concat(b.slice(1, -1)).map(([x, y]) => [x / k, y]);
}

const area = ring => Math.abs(ring.reduce((sum, [x1, y1], i) => {const [x2, y2] = ring[(i + 1) % ring.length]; return sum + x1 * y2 - x2 * y1;}, 0)) / 2;
function inside([x, y], ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
// Distância (km, aproximação equirretangular local) do ponto [lon, lat] à borda do anel.
function edgeKm([lon, lat], ring) {
  const k = Math.cos(lat * Math.PI / 180), p = [lon * k, lat];
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    best = Math.min(best, segmentDistance(p, [a[0] * k, a[1]], [b[0] * k, b[1]]));
  }
  return best * KM_PER_DEGREE;
}
const insideAll = (point, rings) => rings.reduce((hit, ring) => hit !== inside(point, ring), false);
const nearCapital = (ring, capitals) => capitals.some(city => inside([city.lon, city.lat], ring) || edgeKm([city.lon, city.lat], ring) <= COAST_TOLERANCE_KM);

async function main() {
  const options = args(process.argv.slice(2));
  const geojson = await readSource(options.source);
  const feature = geojson.features?.find(item => item.properties?.ADM0_A3 === 'BRA');
  if (!feature) throw new Error('Brasil (ADM0_A3 = BRA) não encontrado na fonte.');
  const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const capitals = loadCapitals();
  if (capitals.length !== 27) throw new Error(`Esperava 27 capitais em dist/capitals.js, achei ${capitals.length}.`);

  const all = polygons.flat(1).flat(1), lats = all.map(p => p[1]);
  const k = Math.cos((Math.max(...lats) + Math.min(...lats)) / 2 * Math.PI / 180);
  const rings = [];
  let sourcePoints = 0;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      sourcePoints += ring.length;
      if (area(ring) < options.minArea && !nearCapital(ring, capitals)) continue;
      const simple = simplifyRing(ring, options.tolerance, k).map(([lon, lat]) => [+lon.toFixed(DECIMALS), +lat.toFixed(DECIMALS)]);
      if (simple.length >= 4) rings.push(simple);
    }
  }
  // Maior anel (o continente) primeiro: leitura e depuração mais fáceis.
  rings.sort((a, b) => area(b) - area(a));
  const coast = capitals.filter(city => !insideAll([city.lon, city.lat], rings))
    .map(city => ({name:city.name, km:Math.min(...rings.map(ring => edgeKm([city.lon, city.lat], ring)))}));
  const far = coast.filter(item => item.km > COAST_TOLERANCE_KM);
  if (far.length) throw new Error(`Capitais a mais de ${COAST_TOLERANCE_KM} km do contorno: ${far.map(c => `${c.name} (${c.km.toFixed(1)} km)`).join(', ')}. Diminua --tolerance.`);

  const meta = {
    source:'Natural Earth 1:10m Cultural Vectors, Admin 0 – Countries (v5.1.2), domínio público',
    url:'https://www.naturalearthdata.com/', tolerance:options.tolerance, minArea:options.minArea, decimals:DECIMALS
  };
  const body = rings.map(ring => '[' + ring.flat().join(',') + ']').join(',\n');
  const file = `/* Contorno do Brasil para o mapa do "Brasil agora". GERADO por scripts/build-brazil-outline.cjs: não editar à mão.
   ${meta.source}. Douglas-Peucker com tolerância ${meta.tolerance}° (no plano lon·cos(lat)), ilhas abaixo de ${meta.minArea}°²
   descartadas (exceto as que têm capital), coordenadas com ${DECIMALS} casas. Anéis planos [lon, lat, lon, lat, …], o continente primeiro;
   regra par-ímpar entre os anéis. */
(function(root, data) {
  if (typeof module === 'object' && module.exports) module.exports = data;
  else (root.PLUVIA = root.PLUVIA || {}).brazilOutline = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, Object.freeze({
  source:${JSON.stringify(meta.source)},
  tolerance:${meta.tolerance}, minArea:${meta.minArea},
  // Capitais na orla podem cair até esta distância fora da linha de costa (resolução da fonte); ver o gerador.
  coastToleranceKm:${COAST_TOLERANCE_KM},
  rings:[
${body}
  ]
}));
`;
  fs.writeFileSync(options.out, file);
  const kept = rings.reduce((sum, ring) => sum + ring.length, 0);
  console.log(JSON.stringify({out:path.relative(repo, options.out), bytes:Buffer.byteLength(file), rings:rings.length, points:kept, sourcePoints,
    capitalsInside:capitals.length - coast.length, onTheShore:coast.map(c => `${c.name} ${c.km.toFixed(1)} km`)}));
}

main().catch(error => {console.error(error.message); process.exit(1);});
