// Seletor de vidro que segue o dedo (1.53, pedido do dono: "o verdadeiro liquid glass com os botões unificados, de só
// passar o dedo deslizando", como o seletor de Fotos do iOS 26). Nas Próximas horas, a bolha de vidro acompanha o dedo
// enquanto ele arrasta, passa pelos segmentos (o conteúdo troca junto, pelo clique que o próprio botão já dispara) e
// encaixa no segmento mais próximo quando o dedo sai. Toque simples continua sendo um clique nativo.
//
// Vidro de gelatina (1.67, pedido do dono com vídeo de referência, um interruptor com cápsula de vidro transparente):
// a bolha virou uma cápsula real (.glass-knob), um pouco mais alta que o trilho, que
//  - amplia o que está embaixo (LENS.zoom): dentro dela há uma cópia dos ícones do trilho, alinhada ao trilho e
//    ampliada pelo centro da cápsula; os ícones de verdade somem embaixo dela (máscara no CSS), então só se vê a lente;
//  - mostra os ícones sempre acesos (cor cheia), como o vidro da referência "carrega a luz";
//  - entorta a borda e separa vermelho/verde/azul ali (filtro SVG com mapa de deslocamento gerado em canvas para o
//    tamanho medido da cápsula), só onde o filtro foi conferido (Chromium) ou com ?refracao=1 na URL para testar;
//  - anda numa mola: atrasa atrás do dedo, estica na velocidade (afinando na altura para manter o volume) e treme
//    numa segunda mola amortecida, alimentada pela aceleração.
// Borda clara, faixa escura de refração, franja de cor, dois brilhos e sombra são pintura no CSS (continuous.css).
// Só transform e variáveis; requestAnimationFrame apenas enquanto a cápsula se mexe. Movimento reduzido: encaixe
// direto, sem mola. Sem ponteiro, o seletor fica como estava (destaque por aria-pressed).
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
  const MAX_STRETCH = 0.22; // esticão máximo da cápsula no pico de velocidade
  const STRETCH_GAIN = 0.12; // esticão por px/ms de velocidade

  // Molas da gelatina. Unidades: posição em segmentos, tempo em segundos.
  const JELLY = {
    stiffness: 380,        // mola que leva a cápsula ao dedo ou ao segmento (s⁻²)
    damping: 26,           // amortecimento (s⁻¹); com a rigidez acima, ζ ≈ 0,67: um quique curto
    wobbleStiffness: 700,  // mola do tremor (s⁻²)
    wobbleDamping: 13,     // ζ ≈ 0,25: treme algumas vezes antes de parar
    wobbleGain: 4.5e-6,    // deformação por px/s² de aceleração
    maxWobble: 0.12,       // tremor nunca deforma mais que isso
    grab: 1.6,             // impulso no tremor ao encostar o dedo (s⁻¹)
    maxStep: 1 / 120,      // passo de integração (s)
    maxFrame: 0.064        // um quadro nunca avança mais que isso (aba que voltou do fundo)
  };

  // Lente: ampliação no centro, faixa da borda que entorta, deslocamento máximo e separação das cores.
  const LENS = {
    zoom: 1.28,
    band: 0.42,            // faixa da borda que entorta, como fração do raio da cápsula
    bend: 0.36,            // deslocamento máximo na borda, como fração do raio
    split: 0.2,            // vermelho entorta 20% menos e azul 20% mais que o verde
    pixelRatio: 2          // amostras do mapa por px
  };

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

  // Esticão pela velocidade (px por ms). Zero em repouso; cresce com a velocidade e para no máximo.
  function stretch(velocity) {
    const v = Math.abs(Number(velocity) || 0);
    return round(1 + Math.min(MAX_STRETCH, v * STRETCH_GAIN), 3);
  }

  function round(n, digits) {
    const f = 10 ** digits;
    return Math.round(n * f) / f;
  }

  // Um avanço das duas molas. state = {x, v, w, wv}: posição e velocidade da cápsula (segmentos, segmentos/s) e
  // deformação e velocidade do tremor. A aceleração da cápsula (em px/s², por isso segPx) empurra o tremor.
  function step(state, target, dt, segPx) {
    let { x, v, w, wv } = state;
    const px = Math.max(1, Number(segPx) || 1);
    let left = Math.min(Math.max(Number(dt) || 0, 0), JELLY.maxFrame);
    while (left > 1e-6) {
      const h = Math.min(JELLY.maxStep, left);
      left -= h;
      const a = JELLY.stiffness * (target - x) - JELLY.damping * v;
      v += a * h;
      x += v * h;
      const rest = JELLY.wobbleGain * a * px;
      wv += (JELLY.wobbleStiffness * (rest - w) - JELLY.wobbleDamping * wv) * h;
      w += wv * h;
    }
    return { x, v, w, wv };
  }

  // Parado no alvo: a animação pode desligar.
  function settled(state, target) {
    return Math.abs(target - state.x) < 0.002 && Math.abs(state.v) < 0.02 && Math.abs(state.w) < 0.002 && Math.abs(state.wv) < 0.05;
  }

  // Forma da cápsula: estica na direção do movimento e afina na outra, mantendo o volume (sx · sy = 1).
  function shape(state, segPx) {
    const speed = Math.abs(state.v) * Math.max(1, Number(segPx) || 1) / 1000; // px/ms
    const wobble = Math.min(JELLY.maxWobble, Math.max(-JELLY.maxWobble, state.w));
    const sx = stretch(speed) * (1 + wobble);
    return { sx: round(sx, 4), sy: round(1 / sx, 4) };
  }

  // Mapa de deslocamento da borda da cápsula (R = x, G = y, 128 = parado), no formato do feDisplacementMap.
  // Para cada ponto, distância até a borda da cápsula (raio = metade do lado menor) e direção para dentro; na
  // faixa junto da borda o deslocamento cresce até a borda (curva quadrática): ali o vidro mostra o que está mais
  // para dentro, como a borda grossa de uma lente. Fora da faixa nada se move.
  function lensMap(width, height, pixelRatio = LENS.pixelRatio) {
    const k = Math.max(1, Math.round(pixelRatio));
    const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
    const radius = Math.min(w, h) / 2, band = radius * LENS.band;
    const data = new Uint8ClampedArray(w * k * h * k * 4);
    for (let j = 0; j < h * k; j++) for (let i = 0; i < w * k; i++) {
      const x = (i + 0.5) / k, y = (j + 0.5) / k;
      // Ponto mais próximo no eixo da cápsula (segmento entre os centros das duas pontas arredondadas).
      const ax = w >= h ? Math.min(Math.max(x, radius), w - radius) : w / 2;
      const ay = w >= h ? h / 2 : Math.min(Math.max(y, radius), h - radius);
      const vx = ax - x, vy = ay - y, dist = Math.hypot(vx, vy), edge = radius - dist;
      let r = 128, g = 128;
      if (dist > 1e-6 && edge < band && edge >= 0) {
        const m = (1 - edge / band) ** 2;
        r = Math.round(128 + 127 * m * vx / dist);
        g = Math.round(128 + 127 * m * vy / dist);
      }
      data.set([r, g, 128, 255], (j * w * k + i) * 4);
    }
    return { width: w * k, height: h * k, data };
  }

  function start(root) {
    const doc = root.document;
    if (!doc || typeof doc.addEventListener !== "function" || !root.PointerEvent) return;
    const reduced = () => { try { return root.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
    const now = () => root.performance?.now?.() ?? Date.now();
    // Refração de verdade (filtro SVG): ligada onde foi conferida (Chromium) ou a pedido, para testar noutro motor.
    const refract = (() => { try { return Boolean(root.navigator?.userAgentData) || /[?&]refracao=1(&|$)/.test(root.location?.search || ""); } catch { return false; } })();

    function segments(group) {
      return [...group.querySelectorAll("[data-mode]")];
    }

    // Cápsula: lente com a cópia dos ícones (.glass-knob-strip, alinhada ao trilho) e a borda pintada por cima.
    function buildKnob(group, list) {
      if (typeof doc.createElement !== "function" || typeof group.append !== "function") return null;
      const el = (className) => { const node = doc.createElement("span"); node.className = className; return node; };
      const knob = el("glass-knob"), refraction = el("glass-knob-refract"), lens = el("glass-knob-lens"), strip = el("glass-knob-strip");
      knob.setAttribute("aria-hidden", "true");
      const cells = list.map((button, index) => {
        const cell = el("glass-knob-cell"), icon = button.querySelector?.("svg");
        if (icon) cell.append(icon.cloneNode(true));
        button.style?.setProperty("--i", String(index));
        return cell;
      });
      strip.append(...cells); lens.append(strip); refraction.append(lens);
      knob.append(refraction, el("glass-knob-rim"));
      group.append(knob);
      return { knob, refraction, cells, filter: null, size: "" };
    }

    // Filtro da borda: três deslocamentos (vermelho menos, azul mais) somados por canal. O mapa é pintado num
    // canvas do tamanho medido da cápsula; só é refeito quando o tamanho muda.
    function buildFilter(parts) {
      const { knob, refraction } = parts;
      const width = knob.offsetWidth, height = knob.offsetHeight, size = `${width}x${height}`;
      if (!width || !height || size === parts.size) return;
      parts.size = size;
      const map = lensMap(width, height), canvas = doc.createElement("canvas"), ctx = canvas.getContext?.("2d");
      if (!ctx || typeof doc.createElementNS !== "function") return;
      canvas.width = map.width; canvas.height = map.height;
      const image = ctx.createImageData(map.width, map.height);
      image.data.set(map.data);
      ctx.putImageData(image, 0, 0);
      let href;
      try { href = canvas.toDataURL("image/png"); } catch { return; }
      // O feDisplacementMap desloca scale × (canal − 0,5): com o canal no máximo, metade de scale. Para a borda
      // deslocar LENS.bend × raio, scale = 2 × LENS.bend × raio = LENS.bend × lado menor.
      const ns = "http://www.w3.org/2000/svg", bend = Math.min(width, height) * LENS.bend;
      const node = (name, attrs) => { const item = doc.createElementNS(ns, name); for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, String(value)); return item; };
      const filter = node("filter", { id: "pluviaJellyLens", x: 0, y: 0, width: 1, height: 1, "color-interpolation-filters": "sRGB" });
      filter.append(node("feImage", { href, x: 0, y: 0, width, height, preserveAspectRatio: "none", result: "map" }));
      const channel = { r: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", g: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", b: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" };
      for (const [name, factor] of [["r", 1 - LENS.split], ["g", 1], ["b", 1 + LENS.split]]) {
        filter.append(node("feDisplacementMap", { in: "SourceGraphic", in2: "map", scale: round(bend * factor, 2), xChannelSelector: "R", yChannelSelector: "G", result: `${name}Bent` }));
        filter.append(node("feColorMatrix", { in: `${name}Bent`, type: "matrix", values: channel[name], result: name }));
      }
      filter.append(node("feBlend", { in: "r", in2: "g", mode: "screen", result: "rg" }), node("feBlend", { in: "rg", in2: "b", mode: "screen" }));
      if (!parts.filter) {
        const svg = node("svg", { class: "glass-knob-defs", width: 0, height: 0, "aria-hidden": "true", focusable: "false" });
        knob.append(svg);
        parts.filter = svg;
      }
      parts.filter.replaceChildren(filter);
      refraction.style.filter = "url(#pluviaJellyLens)";
    }

    function bind(group) {
      if (group.dataset.glassSegment === "on") return;
      group.dataset.glassSegment = "on";
      let drag = null;
      const parts = buildKnob(group, segments(group));
      const current = () => {
        const list = segments(group);
        return Math.max(0, list.findIndex(button => button.getAttribute("aria-pressed") === "true"));
      };
      // Medidas reais dos botões (desktop: 44 px com 2 px de espaço; celular: divididos pela largura).
      let segPx = 46;
      const measure = () => {
        const list = segments(group);
        if (list.length < 2) return;
        const first = list[0], second = list[1];
        segPx = Math.max(1, second.offsetLeft - first.offsetLeft);
        group.style.setProperty("--seg-x0", `${first.offsetLeft}px`);
        group.style.setProperty("--seg-w", `${first.offsetWidth}px`);
        group.style.setProperty("--seg-step", `${segPx}px`);
        if (!parts) return;
        // Cada cópia fica na caixa do seu botão, nas coordenadas do trilho.
        parts.cells.forEach((cell, index) => {
          const button = list[index];
          if (!button) return;
          cell.style.left = `${button.offsetLeft}px`; cell.style.top = `${button.offsetTop}px`;
          cell.style.width = `${button.offsetWidth}px`; cell.style.height = `${button.offsetHeight}px`;
        });
        if (refract) buildFilter(parts);
      };

      // Estado das molas e laço de animação (só roda enquanto a cápsula não está parada no alvo).
      let state = { x: current(), v: 0, w: 0, wv: 0 }, target = state.x, frame = 0, last = 0;
      const paint = () => {
        const form = shape(state, segPx);
        group.style.setProperty("--seg", String(round(state.x, 4)));
        group.style.setProperty("--knob-sx", String(form.sx));
        group.style.setProperty("--knob-sy", String(form.sy));
      };
      const rest = () => { state = { x: target, v: 0, w: 0, wv: 0 }; paint(); };
      const tick = (time) => {
        frame = 0;
        state = step(state, target, (time - last) / 1000, segPx);
        last = time;
        if (settled(state, target)) { rest(); return; }
        paint();
        frame = root.requestAnimationFrame(tick);
      };
      const moveTo = (next, impulse = 0) => {
        target = next;
        if (reduced() || typeof root.requestAnimationFrame !== "function") { if (frame) root.cancelAnimationFrame?.(frame); frame = 0; rest(); return; }
        state.wv += impulse;
        if (frame) return;
        last = now();
        frame = root.requestAnimationFrame(tick);
      };

      measure();
      // O observer só agenda: medir (offsetLeft/offsetWidth) e escrever as variáveis dentro do próprio callback
      // fazia o WebKit adiar notificações e disparar "ResizeObserver loop completed with undelivered
      // notifications" (erro de página que derrubava o QA visual intermitentemente). Uma medição por quadro.
      let measuring = 0;
      const later = () => {
        if (measuring) return;
        if (typeof root.requestAnimationFrame !== "function") { measure(); return; }
        measuring = root.requestAnimationFrame(() => { measuring = 0; measure(); });
      };
      if (typeof root.ResizeObserver === "function") new root.ResizeObserver(later).observe(group);

      group.addEventListener("pointerdown", event => {
        if (event.button !== undefined && event.button !== 0) return;
        const list = segments(group);
        if (list.length < 2) return;
        measure();
        const segWidth = list[1].offsetLeft - list[0].offsetLeft;
        drag = { id: event.pointerId, x: event.clientX, base: current(), segWidth, count: list.length, moved: false, lastX: event.clientX };
        // Encostar o dedo dá um tranco na gelatina (o "blop" da referência, sem som).
        moveTo(target, JELLY.grab);
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
        drag.lastX = event.clientX;
        const pos = position(drag.base, dx, drag.segWidth, drag.count);
        moveTo(pos);
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
        moveTo(index); // a mola leva a cápsula ao segmento escolhido
      };
      group.addEventListener("pointerup", finish);
      group.addEventListener("pointercancel", finish);
      // Modo trocado por toque, por teclado ou ao carregar (modo salvo): a cápsula viaja até o segmento marcado.
      // Durante um arraste quem manda é o dedo, então essa atualização é ignorada.
      if (typeof root.MutationObserver === "function") {
        new root.MutationObserver(() => { if (!drag?.moved) moveTo(current()); })
          .observe(group, { attributes: true, attributeFilter: ["aria-pressed"], subtree: true });
      }
      rest();
    }

    const scan = () => { for (const group of doc.querySelectorAll(SELECTOR)) bind(group); };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", scan, { once: true });
    else scan();
  }

  return { position, nearest, stretch, step, settled, shape, lensMap, JELLY, LENS, start };
});
