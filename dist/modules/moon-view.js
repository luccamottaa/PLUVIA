(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.PLUVIA = root.PLUVIA || {};
    root.PLUVIA.moonView = api.create({document:root.document,
      getIllumination:date => root.PLUVIA.moon?.getMoonIllumination(date)});
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
  function create({document, getIllumination} = {}) {
    let shadeKey = null;
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
      image.setAttribute('href', url);
      return Boolean(url);
    }
    function update(at = Date.now()) {
      let phase,reading;
      try {reading=getIllumination?.(new Date(at));phase=reading?.phase;} catch (_) {}
      const available = Number.isFinite(phase) && phase >= 0 && phase <= 1;
      const label = available ? NAMES[Math.round(phase * 8) % 8] : 'Fase indisponível';
      const fraction = available ? Number.isFinite(reading?.fraction) && reading.fraction>=0 && reading.fraction<=1 ? reading.fraction : (1 - Math.cos(phase * Math.PI * 2)) / 2 : 0;
      const shaded = paintShade(phase, available);
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
  return {create,phasePath,shading};
});
