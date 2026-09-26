/* Reflexo leve, guiado pelo dedo ou cursor, sem bloquear controles e rolagem. */
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reducedTransparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
  let current = null;
  let pending = null;
  let frame = 0;

  const cardFor = target => target instanceof Element ? target.closest('.panel') : null;
  const enabled = () => !reducedMotion.matches && !reducedTransparency.matches;

  function update(card, event) {
    if (!card || !enabled()) return;
    const rect = card.getBoundingClientRect();
    pending = {
      card,
      x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)),
      y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100))
    };
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!pending?.card.isConnected) return;
      const { card: active, x, y } = pending;
      active.style.setProperty('--glass-x', `${x}%`);
      active.style.setProperty('--glass-y', `${y}%`);
      active.classList.add('glass-interactive');
    });
  }

  document.addEventListener('pointermove', event => {
    const card = cardFor(event.target);
    if (current && current !== card) current.classList.remove('glass-active');
    current = card;
    update(card, event);
  }, { passive: true });

  document.addEventListener('pointerdown', event => {
    const card = cardFor(event.target);
    if (!card || !enabled()) return;
    current = card;
    update(card, event);
    card.classList.add('glass-active');
    const ring = document.createElement('span');
    ring.className = 'glass-touch-ring';
    const rect = card.getBoundingClientRect();
    ring.style.left = `${event.clientX - rect.left}px`;
    ring.style.top = `${event.clientY - rect.top}px`;
    ring.setAttribute('aria-hidden', 'true');
    card.append(ring);
    ring.addEventListener('animationend', () => ring.remove(), { once: true });
    setTimeout(() => ring.remove(), 750);
  }, { passive: true });

  function release(event) {
    const card = cardFor(event.target) || current;
    if (card) card.classList.remove('glass-active');
    if (event.pointerType !== 'mouse' && card) {
      setTimeout(() => {
        card.classList.remove('glass-interactive');
        card.style.removeProperty('--glass-x');
        card.style.removeProperty('--glass-y');
      }, 350);
    }
  }
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  document.addEventListener('pointerout', event => {
    const card = cardFor(event.target);
    if (!card || card.contains(event.relatedTarget)) return;
    card.classList.remove('glass-active', 'glass-interactive');
    if (current === card) current = null;
  }, { passive: true });
})();
