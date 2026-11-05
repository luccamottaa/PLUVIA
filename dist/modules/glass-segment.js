// Seletor de vidro que segue o dedo (1.53, pedido do dono: "o verdadeiro liquid glass com os botões unificados, de só
// passar o dedo deslizando", como o seletor de Fotos do iOS 26). Nas Próximas horas, a bolha de vidro acompanha o dedo
// enquanto ele arrasta, estica um pouco na velocidade do arraste, passa pelos segmentos (o conteúdo troca junto, pelo
// clique que o próprio botão já dispara) e encaixa no segmento mais próximo com uma mola curta quando o dedo sai.
// Toque simples continua sendo um clique nativo; sem ponteiro ou com movimento reduzido, o seletor fica como estava.
// Só transform na bolha e uma variável no próprio seletor; nada cria camada nova nem blur adicional.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.glassSegment = api;
  if (root.document) api.start(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SELECTOR = ".hourly-modes";
  const DRAG_START = 4;     // px até o gesto virar arraste (abaixo disso é toque)
  const RUBBER = 0.28;      // fração do deslocamento que passa das bordas (elástico)
  const MAX_STRETCH = 0.14; // esticão máximo da bolha no pico de velocidade

  // Posição contínua da bolha, em segmentos (0 a count-1). Passando das bordas, o movimento é amortecido.
  function position(startIndex, dx, segWidth, count) {
    const last = Math.max(0, count - 1);
    const raw = startIndex + (Number(dx) || 0) / Math.max(1, Number(segWidth) || 1);
    if (raw < 0) return round(-Math.tanh(-raw) * RUBBER * 2, 4);
    if (raw > last) return round(last + Math.tanh(raw - last) * RUBBER * 2, 4);
    return round(raw, 4);
  }

  // Segmento de encaixe: o mais próximo da posição, dentro dos limites.
  function nearest(pos, count) {
    const last = Math.max(0, count - 1);
    return Math.min(last, Math.max(0, Math.round(Number(pos) || 0)));
  }

  // Esticão pela velocidade do arraste (px por ms). Zero em repouso; cresce devagar e para no máximo.
  function stretch(velocity) {
    const v = Math.abs(Number(velocity) || 0);
    return round(1 + Math.min(MAX_STRETCH, v * 0.06), 3);
  }

  function round(n, digits) {
    const f = 10 ** digits;
    return Math.round(n * f) / f;
  }

  function start(root) {
    const doc = root.document;
    if (!doc || typeof doc.addEventListener !== "function" || !root.PointerEvent) return;
    const reduced = () => { try { return root.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

    function segments(group) {
      return [...group.querySelectorAll("[data-mode]")];
    }

    function bind(group) {
      if (group.dataset.glassSegment === "on") return;
      group.dataset.glassSegment = "on";
      let drag = null;
      const current = () => {
        const list = segments(group);
        return Math.max(0, list.findIndex(button => button.getAttribute("aria-pressed") === "true"));
      };
      // Medidas reais dos botões (desktop: 44 px com 2 px de espaço; celular: divididos pela largura).
      const measure = () => {
        const list = segments(group);
        if (list.length < 2) return;
        const first = list[0], second = list[1];
        group.style.setProperty("--seg-x0", `${first.offsetLeft}px`);
        group.style.setProperty("--seg-w", `${first.offsetWidth}px`);
        group.style.setProperty("--seg-step", `${second.offsetLeft - first.offsetLeft}px`);
      };
      const paint = (pos, velocity) => {
        group.style.setProperty("--seg", String(pos));
        group.style.setProperty("--seg-stretch", String(velocity === undefined ? 1 : stretch(velocity)));
      };
      measure();
      if (typeof root.ResizeObserver === "function") new root.ResizeObserver(measure).observe(group);

      group.addEventListener("pointerdown", event => {
        if (event.button !== undefined && event.button !== 0) return;
        const list = segments(group);
        if (list.length < 2) return;
        measure();
        const segWidth = list[1].offsetLeft - list[0].offsetLeft;
        drag = { id: event.pointerId, x: event.clientX, t: event.timeStamp, base: current(), segWidth, count: list.length, moved: false, lastX: event.clientX, lastT: event.timeStamp, target: null };
      });

      group.addEventListener("pointermove", event => {
        if (!drag || event.pointerId !== drag.id) return;
        const dx = event.clientX - drag.x;
        if (!drag.moved) {
          if (Math.abs(dx) < DRAG_START) return;
          drag.moved = true;
          group.dataset.dragging = "";
          try { group.setPointerCapture(event.pointerId); } catch {}
        }
        const pos = position(drag.base, dx, drag.segWidth, drag.count);
        const dt = Math.max(1, event.timeStamp - drag.lastT);
        const velocity = reduced() ? 0 : (event.clientX - drag.lastX) / dt;
        drag.lastX = event.clientX; drag.lastT = event.timeStamp;
        paint(pos, velocity);
        // Trocar o conteúdo enquanto o dedo passa pelo segmento: o próprio botão dispara o clique que já existe.
        const index = nearest(pos, drag.count);
        const list = segments(group);
        if (index !== current() && list[index]) list[index].click();
        event.preventDefault?.();
      });

      const finish = event => {
        if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.id)) return;
        const done = drag;
        drag = null;
        if (!done.moved) return; // toque simples: o clique nativo já cuida dele
        delete group.dataset.dragging;
        const index = nearest(position(done.base, (event.clientX ?? done.lastX) - done.x, done.segWidth, done.count), done.count);
        const list = segments(group);
        if (index !== current() && list[index]) list[index].click();
        paint(index, undefined); // mola para o segmento escolhido
      };
      group.addEventListener("pointerup", finish);
      group.addEventListener("pointercancel", finish);
      // Modo trocado por toque, por teclado ou ao carregar (modo salvo): a bolha vai para o segmento marcado.
      // Durante um arraste quem manda é o dedo, então essa atualização é ignorada.
      if (typeof root.MutationObserver === "function") {
        new root.MutationObserver(() => { if (!drag?.moved) paint(current()); })
          .observe(group, { attributes: true, attributeFilter: ["aria-pressed"], subtree: true });
      }
      paint(current());
    }

    const scan = () => { for (const group of doc.querySelectorAll(SELECTOR)) bind(group); };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", scan, { once: true });
    else scan();
  }

  return { position, nearest, stretch, start };
});
