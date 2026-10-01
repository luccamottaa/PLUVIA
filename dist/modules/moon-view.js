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
  function create({document, getIllumination} = {}) {
    function update(at = Date.now()) {
      let phase;
      try { phase = getIllumination?.(new Date(at))?.phase; } catch (_) {}
      const available = Number.isFinite(phase) && phase >= 0 && phase <= 1;
      const label = available ? NAMES[Math.round(phase * 8) % 8] : 'Fase indisponível';
      const fraction = available ? (1 - Math.cos(phase * Math.PI * 2)) / 2 : 0;
      document?.getElementById?.('moonIcon')?.setAttribute('d',available ? phasePath(phase) : '');
      document?.getElementById?.('moonDisc')?.setAttribute('visibility',available ? 'visible' : 'hidden');
      const text = document?.getElementById?.('moonPhase');
      if (text) text.textContent = label;
      const illumination = document?.getElementById?.('moonIllumination');
      if (illumination) illumination.textContent = available ? Math.round(fraction*100)+'% iluminada · estimativa astronômica' : 'Iluminação indisponível';
      document?.documentElement?.style?.setProperty('--moon-light',fraction.toFixed(3));
      return {available,phase,label,fraction};
    }
    return {update};
  }
  return {create,phasePath};
});
