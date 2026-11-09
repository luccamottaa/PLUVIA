// Parallax do céu (1.64, pedido do dono): ao rolar, o conteúdo sobe na velocidade normal e o céu fixo sobe bem
// devagar, cada camada no seu ritmo, como se estivesse mais longe: estrelas e Sol/Lua quase parados, a nuvem de
// trás um pouco mais rápida e a da frente mais ainda. A nuvem 3D (volumetric-clouds) lê o deslocamento dela em
// `current()` a cada quadro e desloca o próprio desenho (o canvas não se move), e corrige a posição do Sol/Lua
// pelo mesmo número, para o disco escondido atrás da nuvem continuar no lugar certo.
// Usa a propriedade `translate` (soma com o `transform` já animado das camadas, sem brigar com ele), escreve só
// quando muda ≥ 1 px, num scroll passivo com rAF. Para depois de ~1400 px de rolagem. Movimento reduzido: nada.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.skyParallax = api;
  if (root.document) api.start(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MAX_SCROLL = 1400;
  // Fração da rolagem que cada camada acompanha (negativo = sobe).
  const RATES = Object.freeze({stars:.02, astro:.04, back:.06, canvas:.07, front:.11});
  const LAYERS = Object.freeze({stars:".sky-stars", astro:".sky-sun, .sky-moon, .sky-rainbow", back:".sky-clouds-back", front:".sky-clouds-front"});
  let reduce = false, scrollY = 0;

  function offsets(y) {
    const s = Math.min(Math.max(Number(y) || 0, 0), MAX_SCROLL);
    const out = {};
    for (const [key, rate] of Object.entries(RATES)) out[key] = s ? -Math.round(s * rate) : 0;
    return out;
  }
  // Deslocamento atual (px CSS) para a nuvem 3D: zero com movimento reduzido.
  function current() { return reduce ? offsets(0) : offsets(scrollY); }

  function start(root) {
    const doc = root.document;
    const media = root.matchMedia?.("(prefers-reduced-motion: reduce)");
    reduce = Boolean(media?.matches);
    const init = () => {
      const scene = doc.querySelector(".sky-effects");
      if (!scene) return;
      const groups = Object.entries(LAYERS).map(([key, selector]) => [key, Array.from(scene.querySelectorAll(selector))]);
      const written = {};
      let queued = false;
      const paint = () => {
        queued = false;
        scrollY = root.scrollY || 0;
        const off = current();
        for (const [key, nodes] of groups) {
          if (written[key] === off[key]) continue;
          written[key] = off[key];
          for (const node of nodes) node.style.translate = off[key] ? `0 ${off[key]}px` : "";
        }
      };
      root.addEventListener?.("scroll", () => { if (!queued) { queued = true; root.requestAnimationFrame(paint); } }, {passive:true});
      media?.addEventListener?.("change", event => { reduce = event.matches; paint(); });
      paint();
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, {once:true});
    else init();
  }

  return {offsets, current, start, RATES, MAX_SCROLL};
});
