// Cabeçalho compacto (1.39, pedido do dono com o app Tempo de referência): quando a temperatura sai da tela,
// aparece no topo "Cidade" e "30° | Condição" sobre o mesmo degradê do céu, e o conteúdo some por baixo dele.
// Desde a 1.41 (pedido do dono, opção B) fica numa pílula com o vidro dos cartões e o ícone da condição.
// Sol e Lua esmaecem nos primeiros ~240 px de rolagem: sem blur nos cartões (derrubava o Safari), eles
// apareciam nítidos por cima das letras. Um IntersectionObserver e um scroll passivo com rAF; sem timer.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.compactHeader = api;
  if (root.document) api.start(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const HEAD_PX = 96, FADE_FROM = 40, FADE_PX = 200;

  function format(temp, condition) {
    const t = String(temp || "").trim(), c = String(condition || "").trim();
    return /^-?\d+$/.test(t) ? (c ? `${t}° | ${c}` : `${t}°`) : c;
  }
  // 1 no topo, 0 depois de FADE_FROM + FADE_PX; em passos de 5% para não reescrever o estilo a cada pixel.
  // Ícone só quando o código pertence ao texto à vista (troca de cidade e "Tempo indisponível" trocam o texto).
  function iconKey(cond) {
    const data = cond?.dataset || {};
    if (!data.code || data.text !== String(cond.textContent || "")) return "";
    return `${data.code}:${data.day === "0" ? 0 : 1}`;
  }
  function fadeFor(scrollY) {
    const f = 1 - (Number(scrollY) - FADE_FROM) / FADE_PX;
    if (!Number.isFinite(f)) return 1;
    return Math.round(Math.min(1, Math.max(0, f)) * 20) / 20;
  }

  function start(root) {
    const doc = root.document;
    const init = () => {
      const head = doc.querySelector(".compact-head"), city = doc.getElementById("cityName");
      const temp = doc.getElementById("temperature"), cond = doc.getElementById("condition");
      if (!head || !city || !temp || !cond) return;
      const cityOut = head.querySelector(".compact-city"), nowOut = head.querySelector(".compact-now");
      const iconOut = head.querySelector(".compact-icon");
      let shownIcon = "";
      const copy = () => {
        const name = city.textContent.trim(), now = format(temp.textContent, cond.textContent);
        if (cityOut.textContent !== name) cityOut.textContent = name;
        if (nowOut.textContent !== now) nowOut.textContent = now;
        const key = iconKey(cond), icons = root.PLUVIA?.weatherIcons;
        if (!iconOut || key === shownIcon || (key && !icons?.markup)) return;
        shownIcon = key;
        const [code, day] = key.split(":");
        iconOut.innerHTML = key ? icons.markup(Number(code), day === "1", {className:"compact-icon-img", eager:true}) : "";
      };
      copy();
      if (typeof root.MutationObserver === "function") {
        const watch = new root.MutationObserver(copy);
        for (const node of [city, temp, cond]) watch.observe(node, {childList:true, subtree:true, characterData:true});
        watch.observe(cond, {attributes:true, attributeFilter:["data-code", "data-day", "data-text"]});
      }
      const anchor = temp.closest(".temperature") || temp;
      // A faixa já inclui a área segura do aparelho (relógio/Dynamic Island): a temperatura conta como fora
      // quando passa da parte opaca dela, medida uma vez (a faixa existe escondida desde o início).
      const line = Math.max(HEAD_PX, Math.round(head.offsetHeight || 0) - 44);
      if (typeof root.IntersectionObserver === "function") {
        new root.IntersectionObserver(([entry]) => {
          const on = !entry.isIntersecting && entry.boundingClientRect.top < line;
          if (on !== head.hasAttribute("data-on")) head.toggleAttribute("data-on", on);
        }, {rootMargin:`-${line}px 0px 0px 0px`}).observe(anchor);
      }
      const astros = Array.from(doc.querySelectorAll(".sky-effects > .sky-sun, .sky-effects > .sky-moon"));
      let last = 1, queued = false;
      const paint = () => {
        queued = false;
        const f = fadeFor(root.scrollY);
        if (f === last) return;
        last = f;
        for (const node of astros) node.style.filter = f < 1 ? `opacity(${f})` : "";
      };
      root.addEventListener?.("scroll", () => {
        if (!queued) { queued = true; root.requestAnimationFrame(paint); }
      }, {passive:true});
      paint();
    };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init, {once:true});
    else init();
  }

  return {format, iconKey, fadeFor, start, HEAD_PX};
});
