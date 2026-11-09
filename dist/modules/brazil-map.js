/* Mapa do "Brasil agora": geometria pura (projeção, contorno, ponto no polígono).
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

  return {UNITS_PER_DEGREE, MARGIN, bounds, createProjection, projectRings, pointInRings, distanceToRings, outlinePath};
});
