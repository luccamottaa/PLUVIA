/* Mapa do "Brasil agora": geometria pura (projeção, contorno, ponto no polígono, etiquetas).
   Tudo sai dos dados: o contorno (modules/brazil-outline.js) e a latitude/longitude de cada cidade. Nenhuma posição de
   tela é escrita à mão; a caixa do SVG (viewBox) é calculada da caixa real do contorno mais margens nomeadas.

   Projeção: equirretangular com paralelo padrão na latitude central da caixa do contorno (~-14,2°).
     x = (lon - lonMin) · cos(lat0) · U + margem esquerda
     y = (latMax - lat) · U + margem de cima
   Por que esta: é linear (fácil de testar e de inverter), as distâncias norte-sul são verdadeiras em todo o país e a
   leste-oeste só erra pelo cos da latitude: nada na linha de lat0, até +17% no Chuí e -3% em Roraima. Mercator
   incharia o Sul (Porto Alegre com ~33% de área a mais do que no equador) sem ganho num mapa sem navegação. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).brazilMap = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  // Unidades do viewBox por grau de latitude: só deixa os números do SVG legíveis; o tamanho na tela vem do CSS.
  const UNITS_PER_DEGREE = 10;
  // Folga em volta do contorno, em unidades do viewBox (~1 etiqueta = ~57 × 29 unidades no celular de 390 px).
  // À direita cabe uma coluna de etiquetas no mar, ao lado do litoral do Nordeste, onde as capitais ficam a ~1° umas
  // das outras; nas outras bordas basta meia etiqueta para Boa Vista, Rio Branco e Porto Alegre não serem cortadas.
  const MARGIN = Object.freeze({top:22, right:70, bottom:22, left:24});
  const RAD = Math.PI / 180;

  // Anéis planos [lon, lat, lon, lat, …] → caixa em graus.
  function bounds(rings) {
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const ring of rings) for (let i = 0; i < ring.length; i += 2) {
      const lon = ring[i], lat = ring[i + 1];
      if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
    }
    return {minLon, maxLon, minLat, maxLat};
  }

  function createProjection(rings, {unitsPerDegree = UNITS_PER_DEGREE, margin = MARGIN} = {}) {
    const box = bounds(rings);
    if (!Number.isFinite(box.minLon)) throw new Error('Contorno vazio.');
    const lat0 = (box.minLat + box.maxLat) / 2, k = Math.cos(lat0 * RAD), u = unitsPerDegree;
    const width = Math.ceil((box.maxLon - box.minLon) * k * u + margin.left + margin.right);
    const height = Math.ceil((box.maxLat - box.minLat) * u + margin.top + margin.bottom);
    const project = (lat, lon) => [(lon - box.minLon) * k * u + margin.left, (box.maxLat - lat) * u + margin.top];
    return Object.freeze({lat0, k, unitsPerDegree:u, margin, bounds:box, width, height, viewBox:`0 0 ${width} ${height}`, project});
  }

  // Anéis em coordenadas do viewBox: [[x, y], …] por anel.
  function projectRings(rings, projection) {
    return rings.map(ring => {
      const out = [];
      for (let i = 0; i < ring.length; i += 2) out.push(projection.project(ring[i + 1], ring[i]));
      return out;
    });
  }

  // Regra par-ímpar entre todos os anéis (a mesma do fill-rule padrão do SVG para anéis que não se cruzam).
  function pointInRings([x, y], rings) {
    let hit = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
      }
    }
    return hit;
  }

  // Menor distância do ponto à borda dos anéis (mesmas unidades dos anéis).
  function distanceToRings([x, y], rings) {
    let best = Infinity;
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    return best;
  }

  // Caminho SVG dos anéis projetados, com uma casa decimal (0,1 unidade ≈ 0,1 px no celular).
  function outlinePath(projectedRings) {
    return projectedRings.map(ring => 'M' + ring.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L') + 'Z').join('');
  }

  /* Etiquetas sem sobreposição. Entrada: [{id, x, y, w, h}] com o ponto real (x, y) e o tamanho da etiqueta, tudo em
     unidades do viewBox. Saída: centro de cada etiqueta (cx, cy). O ponto nunca se move; só a etiqueta, ligada a ele por
     uma linha de chamada quando sai de cima dele.
     1. Ordem: primeiro as cidades isoladas (ficam em cima do próprio ponto), depois as de regiões cheias.
     2. Cada etiqueta tenta, em ordem, ficar sobre o ponto e depois em anéis cada vez maiores em volta dele, começando
        pela direção "para fora do país" (do centro das cidades para o ponto: o litoral do Nordeste vai para o mar).
        Fica na primeira posição que cabe no quadro, não encosta em etiqueta já colocada, não cobre o ponto de outra
        cidade e cuja linha de chamada não cruza outra.
     3. Reserva: se nenhuma posição couber (tela estreita demais), um empurrão afasta as sobreposições pelo eixo de
        menor invasão até sumirem.
     Determinístico (sem sorteio): a mesma entrada dá sempre o mesmo desenho, nos testes e no celular. */
  const LAYOUT = Object.freeze({gap:2, dotRadius:3, directions:16, rings:14, ringStep:.55, relaxSteps:200});

  function layoutLabels(items, {width, height, gap = LAYOUT.gap, dotRadius = LAYOUT.dotRadius} = {}) {
    const n = items.length;
    if (!n) return [];
    const cx0 = items.reduce((s, it) => s + it.x, 0) / n, cy0 = items.reduce((s, it) => s + it.y, 0) / n;
    const placed = new Array(n).fill(null);
    const fits = (i, x, y) => {
      const {w, h} = items[i];
      if (x - w / 2 < 0 || x + w / 2 > width || y - h / 2 < 0 || y + h / 2 > height) return false;
      for (let j = 0; j < n; j++) {
        const other = placed[j];
        if (other && Math.abs(x - other[0]) < (w + items[j].w) / 2 + gap && Math.abs(y - other[1]) < (h + items[j].h) / 2 + gap) return false;
        if (j !== i && Math.abs(x - items[j].x) < w / 2 + dotRadius + gap && Math.abs(y - items[j].y) < h / 2 + dotRadius + gap) return false;
        if (other && segmentsCross([items[i].x, items[i].y], [x, y], [items[j].x, items[j].y], other)) return false;
      }
      return true;
    };
    // Vizinhos num raio de duas etiquetas: mede quanto a região é cheia.
    const crowd = items.map((it, i) => items.filter((other, j) => j !== i && Math.abs(other.x - it.x) < it.w * 2 && Math.abs(other.y - it.y) < it.h * 3).length);
    const order = items.map((_, i) => i).sort((a, b) => crowd[a] - crowd[b] || a - b);
    for (const i of order) {
      const it = items[i];
      let spot = fits(i, it.x, it.y) ? [it.x, it.y] : null;
      const base = Math.atan2(it.y - cy0, it.x - cx0);
      // Direções alternando dos dois lados da direção "para fora": 0, +1, -1, +2, -2…
      const angles = Array.from({length:LAYOUT.directions}, (_, d) => base + (d % 2 ? 1 : -1) * Math.ceil(d / 2) * 2 * Math.PI / LAYOUT.directions);
      for (let r = 1; !spot && r <= LAYOUT.rings; r++) {
        for (const a of angles) {
          // Anel elíptico: a etiqueta é mais larga que alta, então se afasta mais na horizontal.
          const x = it.x + Math.cos(a) * (it.w / 2 + it.h * r * LAYOUT.ringStep), y = it.y + Math.sin(a) * (it.h / 2 + it.h * r * LAYOUT.ringStep);
          if (fits(i, x, y)) {spot = [x, y]; break;}
        }
      }
      placed[i] = spot || [Math.min(Math.max(it.x, it.w / 2), width - it.w / 2), Math.min(Math.max(it.y, it.h / 2), height - it.h / 2)];
    }
    if (overlaps(toLabels(items, placed), gap).length) relax(items, placed, {width, height, gap});
    return toLabels(items, placed);
  }

  const toLabels = (items, pos) => items.map((it, i) => ({id:it.id, x:it.x, y:it.y, w:it.w, h:it.h, cx:pos[i][0], cy:pos[i][1]}));

  // Reserva do passo 3: separa pares sobrepostos pelo eixo de menor invasão, metade para cada lado, dentro do quadro.
  function relax(items, pos, {width, height, gap}) {
    for (let step = 0; step < LAYOUT.relaxSteps; step++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1];
        const ox = (items[i].w + items[j].w) / 2 + gap - Math.abs(dx), oy = (items[i].h + items[j].h) / 2 + gap - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) {const s = Math.sign(dx) || (i < j ? -1 : 1); pos[i][0] += s * ox / 2; pos[j][0] -= s * ox / 2;}
        else {const s = Math.sign(dy) || (i < j ? -1 : 1); pos[i][1] += s * oy / 2; pos[j][1] -= s * oy / 2;}
      }
      items.forEach((it, i) => {
        pos[i][0] = Math.min(Math.max(pos[i][0], it.w / 2), width - it.w / 2);
        pos[i][1] = Math.min(Math.max(pos[i][1], it.h / 2), height - it.h / 2);
      });
      if (!moved) return;
    }
  }

  // Cruzamento próprio de dois segmentos (encostar na ponta não conta).
  function segmentsCross(a, b, c, d) {
    const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    return d1 * d2 < 0 && d3 * d4 < 0;
  }

  // Pares de etiquetas que ainda se sobrepõem (testes e verificação no navegador).
  function overlaps(labels, gap = 0) {
    const out = [];
    for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i], b = labels[j];
      if (Math.abs(a.cx - b.cx) < (a.w + b.w) / 2 + gap - 1e-6 && Math.abs(a.cy - b.cy) < (a.h + b.h) / 2 + gap - 1e-6) out.push([a.id, b.id]);
    }
    return out;
  }

  // Linha de chamada do ponto até a borda da etiqueta; null quando a etiqueta já está sobre o ponto.
  function leader(label, clearance = 1) {
    const dx = label.x - label.cx, dy = label.y - label.cy, hw = label.w / 2 + clearance, hh = label.h / 2 + clearance;
    if (Math.abs(dx) <= hw && Math.abs(dy) <= hh) return null;
    const t = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
    return {x1:label.x, y1:label.y, x2:label.cx + dx * t, y2:label.cy + dy * t};
  }

  /* Campo de temperatura para pintar o território: média ponderada pelo inverso do quadrado da distância (IDW), medida
     no plano do mapa, das leituras válidas (capitais + pontos do interior). Grade pequena com a proporção do viewBox (o
     navegador amplia e suaviza; o contorno recorta). Leitura ausente fica fora, nunca vira zero; com menos de
     FIELD.minPoints leituras não há campo. Fica dentro da faixa das leituras: não extrapola calor nem frio. */
  const FIELD = Object.freeze({columns:128, minPoints:6});
  function field(points, projection, columns = FIELD.columns) {
    const valid = points.filter(point => typeof point.temperature === 'number' && Number.isFinite(point.temperature));
    if (valid.length < FIELD.minPoints) return null;
    const rows = Math.max(1, Math.round(columns * projection.height / projection.width));
    const sx = columns / projection.width, sy = rows / projection.height;
    const samples = valid.map(point => {const [x, y] = projection.project(point.lat, point.lon); return [x * sx, y * sy, point.temperature];});
    const values = new Float32Array(columns * rows);
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      let sum = 0, weights = 0, exact = null;
      for (const [px, py, t] of samples) {
        const d2 = (px - col - .5) ** 2 + (py - row - .5) ** 2;
        if (d2 < 1e-6) {exact = t; break;}
        sum += t / d2; weights += 1 / d2;
      }
      values[row * columns + col] = exact ?? sum / weights;
    }
    return {width:columns, height:rows, values};
  }

  /* Desenho no navegador. O contorno (SVG estático: terra, recorte e borda) é montado uma vez por contêiner; a cada
     leitura nova só os pinos são refeitos. Cada pino é: um ponto no SVG, sempre na coordenada da cidade; um <button>
     com a temperatura (cor pela escala recebida, "—" sem dado); e, se a etiqueta saiu de cima do ponto, uma linha de
     chamada. O tamanho das etiquetas é medido na tela e convertido para unidades do viewBox, então o layout é refeito
     quando a largura muda (ResizeObserver), sem refazer os botões. */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const DRAW = Object.freeze({dotPx:3, gapPx:2});
  const views = new WeakMap();

  function svgEl(doc, name, attrs = {}) {
    const node = doc.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  }

  function setup(container, doc, outline, root) {
    const projection = createProjection(outline.rings), d = outlinePath(projectRings(outline.rings, projection));
    const svg = svgEl(doc, 'svg', {viewBox:projection.viewBox, class:'brazil-svg', focusable:'false', 'aria-hidden':'true'});
    const clip = svgEl(doc, 'clipPath', {id:'brazilLandClip'}); clip.append(svgEl(doc, 'path', {d}));
    const defs = svgEl(doc, 'defs'); defs.append(clip);
    const heat = svgEl(doc, 'image', {class:'brazil-heat', x:0, y:0, width:projection.width, height:projection.height,
      preserveAspectRatio:'none', 'clip-path':'url(#brazilLandClip)'});
    const leaders = svgEl(doc, 'g', {class:'brazil-leaders'}), dots = svgEl(doc, 'g', {class:'brazil-dots'});
    svg.append(defs, svgEl(doc, 'path', {class:'brazil-land', d}), heat, svgEl(doc, 'path', {class:'brazil-edge', d}), leaders, dots);
    const labels = doc.createElement('div'); labels.className = 'brazil-labels';
    container.style.aspectRatio = `${projection.width} / ${projection.height}`;
    container.replaceChildren(svg, labels);
    const view = {projection, svg, heat, leaders, dots, labels, pins:[], chips:[], doc};
    if (typeof root?.ResizeObserver === 'function') {
      let last = 0;
      new root.ResizeObserver(() => {const w = container.clientWidth; if (w && w !== last) {last = w; layout(container);}}).observe(container);
    }
    views.set(container, view);
    return view;
  }

  // pins: [{id, lat, lon, text, color|null, label}] na ordem de leitura desejada (Tab segue esta ordem).
  function draw(container, {doc = container.ownerDocument, outline, pins, heatHref = null, root = globalThis}) {
    const view = views.get(container) || setup(container, doc, outline, root);
    if (heatHref) view.heat.setAttribute('href', heatHref); else view.heat.removeAttribute('href');
    view.heat.style.display = heatHref ? '' : 'none';
    view.pins = pins.map(pin => {const [x, y] = view.projection.project(pin.lat, pin.lon); return {...pin, x, y};});
    view.dots.replaceChildren(...view.pins.map(pin => svgEl(doc, 'circle', {class:'brazil-dot', cx:pin.x.toFixed(1), cy:pin.y.toFixed(1), r:DRAW.dotPx})));
    view.chips = view.pins.map(pin => {
      const chip = doc.createElement('button');
      chip.type = 'button'; chip.className = 'brazil-chip'; chip.dataset.cityId = pin.id;
      chip.setAttribute('aria-label', pin.label);
      chip.textContent = pin.text;
      if (pin.color) chip.style.setProperty('--chip', pin.color); else chip.dataset.missing = '';
      return chip;
    });
    view.labels.replaceChildren(...view.chips);
    layout(container);
    return view;
  }

  // Mede as etiquetas, calcula o layout e posiciona; sem largura (diálogo fechado) espera o ResizeObserver.
  function layout(container) {
    const view = views.get(container), px = container.clientWidth;
    if (!view || !px || !view.pins.length) return null;
    const {projection, doc} = view, scale = px / projection.width;
    const items = view.pins.map((pin, i) => ({id:pin.id, x:pin.x, y:pin.y, w:view.chips[i].offsetWidth / scale, h:view.chips[i].offsetHeight / scale}));
    const labels = layoutLabels(items, {width:projection.width, height:projection.height, gap:DRAW.gapPx / scale, dotRadius:DRAW.dotPx / scale});
    labels.forEach((label, i) => {
      view.chips[i].style.left = (label.cx / projection.width * 100).toFixed(3) + '%';
      view.chips[i].style.top = (label.cy / projection.height * 100).toFixed(3) + '%';
    });
    for (const dot of view.dots.children) dot.setAttribute('r', (DRAW.dotPx / scale).toFixed(2));
    view.leaders.replaceChildren(...labels.map(label => leader(label, 1 / scale)).filter(Boolean)
      .map(line => svgEl(doc, 'line', {class:'brazil-leader', x1:line.x1.toFixed(1), y1:line.y1.toFixed(1), x2:line.x2.toFixed(1), y2:line.y2.toFixed(1)})));
    container.dataset.ready = '';
    view.layout = labels;
    return labels;
  }

  // Projeção do contorno carregado (para o campo de cores ser calculado no mesmo plano do desenho).
  const projectionFor = outline => createProjection(outline.rings);

  return {UNITS_PER_DEGREE, MARGIN, LAYOUT, DRAW, FIELD, bounds, createProjection, projectionFor, projectRings, pointInRings, distanceToRings,
    outlinePath, layoutLabels, segmentsCross, overlaps, leader, field, draw, layout};
});
