// Vidro que reage ao toque (1.46, pedido do dono: "liquid glass com as animações que nem da Apple, quando toca nele,
// quando mexe nele"). Nos botões de vidro (conta, compartilhar + busca, pílula do cabeçalho compacto e X das janelas):
// encostar o dedo faz o vidro crescer um pouco e acender um brilho no ponto do toque; arrastar puxa o vidro na direção
// do dedo, esticando de forma elástica (cada vez mais difícil, nunca passa de MAX px); soltar devolve com mola.
// Só transform no próprio botão (elementos de 44 px, não blocos) e opacidade do brilho; uma medida por toque;
// requestAnimationFrame só enquanto o dedo mexe. Movimento reduzido: só o brilho.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.glassTouch = api;
  if (root.document) api.start(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SELECTOR = ".topbar .account-trigger, .topbar .top-actions, .compact-head[data-on] .compact-pill, .dialog-close";
  const MAX = 6, GROW = 1.12;
  // Mola com um pequeno quique na volta (curva de mola amostrada; navegador sem linear() usa o cubic-bezier).
  const SPRING = "linear(0, 0.06 1.6%, 0.24 4.4%, 0.58 9%, 0.9 14%, 1.06 18.6%, 1.12 22.7%, 1.11 26%, 1.07 30%, 1.01 36%, 0.98 42%, 0.975 47%, 0.99 56%, 1.003 68%, 1)";
  const SPRING_FALLBACK = "cubic-bezier(.34,1.56,.64,1)";

  // Deslocamento elástico: tanh deixa o vidro seguir o dedo no começo e frear perto de MAX.
  // Estica no sentido do arraste e afina um pouco no outro, como uma gota.
  function stretch(dx, dy, width, height) {
    const ex = Math.tanh((Number(dx) || 0) / Math.max(1, Number(width) || 1));
    const ey = Math.tanh((Number(dy) || 0) / Math.max(1, Number(height) || 1));
    const round = (n, d) => Number(n.toFixed(d));
    return {
      tx: round(ex * MAX, 2) || 0,
      ty: round(ey * MAX, 2) || 0,
      sx: round(GROW + Math.abs(ex) * 0.08 - Math.abs(ey) * 0.03, 3),
      sy: round(GROW + Math.abs(ey) * 0.08 - Math.abs(ex) * 0.03, 3)
    };
  }
  const clampPct = (v) => `${Math.round(Math.min(100, Math.max(0, v)))}%`;

  function start(root) {
    const doc = root.document;
    if (!doc || typeof doc.addEventListener !== "function") return;
    const reduced = () => { try { return root.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
    const springy = (() => { try { return root.CSS?.supports?.("transition-timing-function", "linear(0, 1)") ? SPRING : SPRING_FALLBACK; } catch { return SPRING_FALLBACK; } })();
    let press = null, frame = 0;

    const paint = () => {
      frame = 0;
      if (!press) return;
      const { el, rect, x, y, x0, y0, still } = press;
      el.style.setProperty("--gx", clampPct(((x - rect.left) / rect.width) * 100));
      el.style.setProperty("--gy", clampPct(((y - rect.top) / rect.height) * 100));
      if (still) return;
      const s = stretch(x - x0, y - y0, rect.width, rect.height);
      el.style.transition = "none";
      el.style.transform = `translate(${s.tx}px, ${s.ty}px) scale(${s.sx}, ${s.sy})`;
    };
    const release = () => {
      if (!press) return;
      const { el, still } = press;
      press = null;
      if (frame) { root.cancelAnimationFrame?.(frame); frame = 0; }
      delete el.dataset.glassPress;
      if (still) return;
      el.style.transition = `transform .62s ${springy}`;
      el.style.transform = "";
      const done = (event) => {
        if (event && event.target !== el) return;
        el.removeEventListener("transitionend", done);
        if (!el.dataset.glassPress) el.style.transition = "";
      };
      el.addEventListener("transitionend", done);
    };

    doc.addEventListener("pointerdown", (event) => {
      if (event.button > 0 || press) return;
      const el = event.target?.closest?.(SELECTOR);
      if (!el || el.disabled || el.matches?.(":disabled")) return;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const still = reduced();
      press = { el, rect, id: event.pointerId, x0: event.clientX, y0: event.clientY, x: event.clientX, y: event.clientY, still };
      el.dataset.glassPress = "";
      el.style.setProperty("--gx", clampPct(((event.clientX - rect.left) / rect.width) * 100));
      el.style.setProperty("--gy", clampPct(((event.clientY - rect.top) / rect.height) * 100));
      if (!still) {
        el.style.transition = "transform .18s cubic-bezier(.2,.9,.3,1.2)";
        el.style.transform = `scale(${GROW})`;
      }
    }, { capture: true, passive: true });
    root.addEventListener("pointermove", (event) => {
      if (!press || event.pointerId !== press.id) return;
      press.x = event.clientX; press.y = event.clientY;
      if (!frame) frame = root.requestAnimationFrame ? root.requestAnimationFrame(paint) : (paint(), 0);
    }, { passive: true });
    for (const type of ["pointerup", "pointercancel"]) {
      root.addEventListener(type, (event) => { if (press && event.pointerId === press.id) release(); }, { passive: true });
    }
    root.addEventListener("blur", release);
    doc.addEventListener("visibilitychange", () => { if (doc.hidden) release(); });
  }

  return { stretch, SELECTOR, MAX, GROW, start };
});
