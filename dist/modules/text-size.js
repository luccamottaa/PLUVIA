// Botões A− / A+ de "Mais do PLUVIA" (1.48, pedido do dono): escolhem um passo de tamanho do texto, guardado só neste
// aparelho (pluvia-text-scale), por cima do Tamanho do Texto do iPhone que o script do topo do index.html já lê.
// O cálculo e a aplicação ficam lá (window.PLUVIA_TEXT_SIZE), para valer desde o primeiro desenho.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.textSize = api;
  if (root.document) api.start(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STEPS = [0.875, 1, 1.125, 1.25, 1.375];
  const KEY = "pluvia-text-scale";
  const label = (scale) => `${Math.round(scale * 100)}%`;
  // Passo seguinte (dir = 1 ou -1), preso às pontas; valor fora da lista vira 100%.
  function next(current, dir) {
    const i = STEPS.indexOf(current);
    const at = i < 0 ? STEPS.indexOf(1) : i;
    return STEPS[Math.min(STEPS.length - 1, Math.max(0, at + dir))];
  }

  function start(root) {
    const doc = root.document;
    const init = () => {
      const down = doc.getElementById("textSizeDown"), up = doc.getElementById("textSizeUp"), out = doc.getElementById("textSizeValue");
      const engine = root.PLUVIA_TEXT_SIZE;
      if (!down || !up || !out || !engine) return;
      const paint = () => {
        const s = engine.scale();
        out.textContent = label(s);
        down.disabled = s <= STEPS[0];
        up.disabled = s >= STEPS[STEPS.length - 1];
      };
      const change = (dir) => {
        const s = next(engine.scale(), dir);
        try { if (s === 1) root.localStorage.removeItem(KEY); else root.localStorage.setItem(KEY, String(s)); } catch {}
        engine.apply();
        paint();
      };
      down.addEventListener("click", () => change(-1));
      up.addEventListener("click", () => change(1));
      paint();
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, {once:true});
    else init();
  }
  return { STEPS, KEY, next, label, start };
});
