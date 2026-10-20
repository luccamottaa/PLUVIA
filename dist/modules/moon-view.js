(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.PLUVIA = root.PLUVIA || {};
    root.PLUVIA.moonView = api.create({document:root.document,
      getIllumination:date => root.PLUVIA.moon?.getMoonIllumination(date),
      getPosition:(date, lat, lon) => root.PLUVIA.moon?.getMoonPosition(date, lat, lon)});
    root.document.addEventListener('DOMContentLoaded',() => root.PLUVIA.moonView.update(),{once:true});
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const NAMES = ['Lua nova','Lua crescente','Quarto crescente','Gibosa crescente',
    'Lua cheia','Gibosa minguante','Quarto minguante','Lua minguante'];

  const SHADE_SIZE = 192, TERMINATOR = .38;
  function phasePath(phase) {
    if (!Number.isFinite(phase) || phase <= 0 || phase >= 1) return '';
    // Projeção do terminador de uma esfera, com norte para cima.
    const waxing = phase < .5;
    const terminator = (waxing ? 1 : -1) * Math.cos(phase * Math.PI * 2);
    const radius = 34, ellipseWidth = Math.abs(terminator) * radius;
    const limb = `M40 6 A${radius} ${radius} 0 0 ${waxing ? 1 : 0} 40 74`;
    const boundary = ellipseWidth < .0001 ? 'L40 6'
      : `A${ellipseWidth.toFixed(4)} ${radius} 0 0 ${terminator > 0 ? 0 : 1} 40 6`;
    return `${limb} ${boundary}Z`;
  }
  // Iluminação natural (pedido do usuário, outubro/2026): em vez da máscara de fase com borda dura, cada
  // ponto do disco recebe a luz que o Sol daria a uma esfera, pela lei de Lommel-Seeliger, a que melhor
  // descreve o regolito lunar (a Lua cheia fica uniforme, sem escurecer na borda, e a luz cai aos poucos
  // até o terminador). Norte para cima e lado iluminado à direita no crescente, como phasePath.
  // A máscara usa alfa (multiplicação linear); a raiz suaviza a passagem para o lado escuro na tela sRGB.
  function shading(phase, size = SHADE_SIZE) {
    if (!Number.isFinite(phase) || phase <= 0 || phase >= 1) return null;
    const angle = phase * Math.PI * 2, lx = Math.sin(angle), lz = -Math.cos(angle);
    const alpha = new Uint8ClampedArray(size * size);
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const nx = (x + .5) / size * 2 - 1, ny = (y + .5) / size * 2 - 1, r2 = nx * nx + ny * ny;
      if (r2 >= 1) continue;
      const nz = Math.sqrt(1 - r2), sun = nx * lx + nz * lz;
      if (sun <= 0) continue;
      // Perto do terminador o relevo faz sombra e a luz rasante escurece aos poucos (Sol a menos de ~25°
      // do horizonte local): uma rampa suave, como nas fotos, em vez do corte quase seco da lei pura.
      const ramp = Math.min(1, sun / TERMINATOR), soft = ramp * ramp * (3 - 2 * ramp);
      alpha[y * size + x] = Math.round(255 * (Math.min(1, 2 * sun / (sun + nz)) * soft) ** (1 / 1.6));
    }
    return alpha;
  }
  // Inclinação como no céu de verdade (pedido do usuário, outubro/2026): o lado claro aponta para o Sol.
  // A máscara é desenhada com o norte para cima e a luz à direita (crescente) ou à esquerda (minguante);
  // `angle` (SunCalc) é o ângulo de posição do limbo iluminado, contado do norte para o leste, e o
  // ângulo paralático leva o norte celeste para a vertical do lugar. A textura gira pelo paralático
  // (a Lua vista daqui) e a sombra, dentro dela, até o limbo ficar no ângulo de posição. Sem cidade
  // ou leitura, nada gira (o desenho antigo, norte para cima). Graus no sentido horário do SVG.
  function tilt(reading, position) {
    const angle = Number(reading?.angle), parallactic = Number(position?.parallacticAngle), phase = Number(reading?.phase);
    if (![angle, parallactic, phase].every(Number.isFinite)) return {surface:0, limb:0};
    const base = phase < .5 ? -90 : 90;
    const wrap = value => Math.round(((value % 360) + 540) % 360 - 180);
    return {surface:wrap(parallactic), limb:wrap(base - angle)};
  }
  function create({document, getIllumination, getPosition} = {}) {
    let shadeKey = null, tiltKey = null;
    function paintTilt({surface, limb}) {
      const key = surface + ':' + limb;
      if (key === tiltKey) return;
      tiltKey = key;
      const set = (node, degrees) => degrees ? node.setAttribute('transform', `rotate(${degrees} 40 40)`) : node.removeAttribute?.('transform');
      const limbNode = document?.getElementById?.('moonLimb');
      if (limbNode) set(limbNode, limb);
      for (const node of document?.querySelectorAll?.('.moon-tilt') || []) set(node, surface);
    }
    // Desenha a máscara só quando a fase muda de verdade (≈ 0,1% do ciclo, uns 40 min): o relógio de 30 s
    // não refaz o canvas. Sem canvas (testes, navegadores antigos), fica o terminador de phasePath.
    function paintShade(phase, available) {
      const image = document?.getElementById?.('moonShade');
      const key = available ? Math.round(phase * 1000) : null;
      if (!image || key === shadeKey) return Boolean(image?.getAttribute?.('href'));
      shadeKey = key;
      let url = '';
      try {
        const canvas = key === null ? null : document.createElement('canvas');
        const context = canvas?.getContext?.('2d');
        const alpha = context && shading(key / 1000);
        if (alpha) {
          canvas.width = canvas.height = SHADE_SIZE;
          const pixels = context.createImageData(SHADE_SIZE, SHADE_SIZE);
          for (let i = 0; i < alpha.length; i += 1) { pixels.data.set([255, 255, 255, alpha[i]], i * 4); }
          context.putImageData(pixels, 0, 0);
          url = canvas.toDataURL('image/png');
        }
      } catch (_) { url = ''; }
      // Sem máscara, o atributo sai: href vazio faz o WebKit pedir a própria página como imagem.
      if (url) image.setAttribute('href', url); else image.removeAttribute?.('href');
      return Boolean(url);
    }
    function update(at = Date.now(), city = null) {
      let phase,reading,position = null;
      try {reading=getIllumination?.(new Date(at));phase=reading?.phase;} catch (_) {}
      try {if (Number.isFinite(city?.lat) && Number.isFinite(city?.lon)) position = getPosition?.(new Date(at), city.lat, city.lon);} catch (_) {}
      const available = Number.isFinite(phase) && phase >= 0 && phase <= 1;
      const label = available ? NAMES[Math.round(phase * 8) % 8] : 'Fase indisponível';
      const fraction = available ? Number.isFinite(reading?.fraction) && reading.fraction>=0 && reading.fraction<=1 ? reading.fraction : (1 - Math.cos(phase * Math.PI * 2)) / 2 : 0;
      const shaded = paintShade(phase, available);
      paintTilt(available ? tilt(reading, position) : {surface:0, limb:0});
      document?.getElementById?.('moonIcon')?.setAttribute('d',available && !shaded ? phasePath(phase) : '');
      for (const id of ['moonDisc', 'moonDiscHd']) document?.getElementById?.(id)?.setAttribute('visibility',available ? 'visible' : 'hidden');
      const text = document?.getElementById?.('moonPhase');
      if (text) text.textContent = label;
      const illumination = document?.getElementById?.('moonIllumination');
      if (illumination) illumination.textContent = available ? Math.round(fraction*100)+'%' : 'Indisponível';
      document?.documentElement?.style?.setProperty('--moon-light',fraction.toFixed(3));
      return {available,phase,label,fraction};
    }
    return {update};
  }
  return {create,phasePath,shading,tilt};
});
