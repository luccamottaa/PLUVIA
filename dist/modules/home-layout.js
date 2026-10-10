/* Personalizar a Home: mostrar/esconder e reordenar as seções abaixo do topo (salvo só neste aparelho)
   e, a partir de 1100 px, distribuí-las em duas colunas. O topo (cidade, temperatura, avisos e dicas)
   é fixo. Seções escondidas ficam fora do layout (o radar escondido nem é consultado). Sem timer:
   aplica na abertura, ao mudar a escolha e quando a largura cruza o limite. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).homeLayout = api;
  if (root.document) api.mount(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const KEY = 'pluvia-home-layout';
  const WIDE = '(min-width: 1100px)';
  const SECTIONS = [
    {id:'hourly', label:'Próximas horas', selector:'section.hourly-peek', column:'left'},
    {id:'details', label:'Leituras, UV e qualidade do ar', selector:'section.metrics', column:'right'},
    {id:'radar', label:'Radar de chuva', selector:'section.weather-map-section', column:'left'},
    {id:'week', label:'Próximos 7 dias', selector:'section.forecast-section', column:'left'},
    {id:'sky', label:'Ciclo do dia, Lua e céu', selector:'section.sun-section', column:'right'}
  ];
  const IDS = SECTIONS.map(section => section.id);

  // Escolha salva → ordem completa (ids desconhecidos/repetidos saem, novos entram no fim) e escondidos.
  function normalize(saved) {
    const order = Array.isArray(saved?.order) ? saved.order.filter((id, index, list) => IDS.includes(id) && list.indexOf(id) === index) : [];
    for (const id of IDS) if (!order.includes(id)) order.push(id);
    const hidden = Array.isArray(saved?.hidden) ? [...new Set(saved.hidden.filter(id => IDS.includes(id)))] : [];
    // Pelo menos uma seção continua visível.
    return {order, hidden:hidden.length >= IDS.length ? hidden.slice(0, IDS.length - 1) : hidden};
  }
  function move(layout, id, delta) {
    const order = [...layout.order], index = order.indexOf(id), target = index + delta;
    if (index < 0 || target < 0 || target >= order.length) return layout;
    [order[index], order[target]] = [order[target], order[index]];
    return normalize({...layout, order});
  }
  function setVisible(layout, id, visible) {
    const hidden = new Set(layout.hidden);
    if (visible) hidden.delete(id); else hidden.add(id);
    return normalize({...layout, hidden:[...hidden]});
  }
  // Colunas do desktop: cada seção mantém a sua coluna, na ordem escolhida.
  function columns(layout) {
    const byId = new Map(SECTIONS.map(section => [section.id, section]));
    return {
      left:layout.order.filter(id => byId.get(id).column === 'left'),
      right:layout.order.filter(id => byId.get(id).column === 'right')
    };
  }

  let openDialog = null;
  function mount(root) {
    const doc = root.document, view = doc.getElementById('weatherView');
    if (!view) return;
    const read = () => { try { return normalize(JSON.parse(root.localStorage.getItem(KEY) || 'null')); } catch { return normalize(null); } };
    const write = layout => { try { root.localStorage.setItem(KEY, JSON.stringify(layout)); } catch {} };
    const nodes = new Map(SECTIONS.map(section => [section.id, view.querySelector(':scope > ' + section.selector) || view.querySelector(section.selector)]));
    const anchor = view.querySelector(':scope > #tips'), nowcast = doc.getElementById('nowcastCard');
    const media = root.matchMedia?.(WIDE);
    let layout = read(), wrapper = null;

    function place() {
      const wide = Boolean(media?.matches);
      // Só move o que está fora do lugar: na ordem padrão a abertura não mexe no DOM (sem layout extra).
      const after = (node, reference) => { if (reference.nextElementSibling !== node) reference.after(node); };
      if (wide) {
        if (!wrapper) {
          wrapper = doc.createElement('div'); wrapper.className = 'home-columns';
          for (const side of ['left', 'right']) { const column = doc.createElement('div'); column.className = 'home-column'; column.dataset.column = side; wrapper.append(column); }
        }
        const top = anchor || view.firstElementChild;
        if (top && top.nextElementSibling !== wrapper) top.after(wrapper);
        const sides = columns(layout);
        for (const side of ['left', 'right']) {
          const column = wrapper.querySelector(`[data-column="${side}"]`);
          sides[side].map(id => nodes.get(id)).filter(Boolean).forEach((node, index) => {
            if (column.children[index] !== node) column.insertBefore(node, column.children[index] || null);
          });
        }
      } else {
        let reference = anchor;
        for (const id of layout.order) {
          const node = nodes.get(id); if (!node) continue;
          if (reference) after(node, reference); else if (view.lastElementChild !== node) view.append(node);
          reference = node;
          // Os acompanhantes entram no mesmo passo (sem mover a seção seguinte duas vezes).
          const companion = id === 'details' ? nowcast : null;
          if (companion) { after(companion, node); reference = companion; }
        }
        wrapper?.remove(); wrapper = null;
      }
      // O Nowcast pausado fica junto das leituras.
      if (nowcast && nodes.get('details')) after(nowcast, nodes.get('details'));
      for (const [id, node] of nodes) {
        const hide = layout.hidden.includes(id);
        if (node && node.hasAttribute('data-home-hidden') !== hide) node.toggleAttribute('data-home-hidden', hide);
      }
      root.dispatchEvent?.(new CustomEvent('pluvia:home-layout', {detail:{layout, wide}}));
    }

    const dialog = doc.getElementById('homeLayoutDialog'), list = doc.getElementById('homeLayoutList');
    function render(focus) {
      if (!list) return;
      const label = id => SECTIONS.find(section => section.id === id).label;
      list.replaceChildren(...layout.order.map((id, index) => {
        const item = doc.createElement('li'), check = doc.createElement('label'), box = doc.createElement('input'), name = doc.createElement('span');
        box.type = 'checkbox'; box.checked = !layout.hidden.includes(id); box.dataset.toggle = id;
        box.disabled = box.checked && layout.hidden.length === IDS.length - 1;
        name.textContent = label(id); check.append(box, name);
        const controls = doc.createElement('span'); controls.className = 'home-layout-move';
        for (const [delta, text, symbol] of [[-1, 'Subir', '↑'], [1, 'Descer', '↓']]) {
          const button = doc.createElement('button'); button.type = 'button'; button.dataset.move = id; button.dataset.delta = String(delta);
          button.textContent = symbol; button.setAttribute('aria-label', `${text} ${label(id)}`);
          button.disabled = delta < 0 ? index === 0 : index === layout.order.length - 1;
          controls.append(button);
        }
        item.append(check, controls);
        return item;
      }));
      if (focus) {
        const target = list.querySelector(focus) || list.querySelector('input');
        (target?.disabled ? list.querySelector('input') : target)?.focus();
      }
    }
    function update(next, focus) { layout = next; write(layout); place(); render(focus); }
    list?.addEventListener('change', event => {
      const id = event.target?.dataset?.toggle;
      if (id) update(setVisible(layout, id, event.target.checked), `[data-toggle="${id}"]`);
    });
    list?.addEventListener('click', event => {
      const button = event.target.closest?.('[data-move]');
      if (!button) return;
      const delta = Number(button.dataset.delta), id = button.dataset.move;
      update(move(layout, id, delta), `[data-move="${id}"][data-delta="${delta}"]`);
    });
    doc.getElementById('homeLayoutReset')?.addEventListener('click', () => update(normalize(null), 'input'));
    function open() { if (!dialog) return; render(); if (!dialog.open) dialog.showModal(); doc.getElementById('homeLayoutClose')?.focus(); }
    openDialog = open;
    const close = () => root.PLUVIA?.dialogs?.close(dialog) ?? dialog.close();
    doc.getElementById('openHomeLayout')?.addEventListener('click', open);
    doc.getElementById('homeLayoutClose')?.addEventListener('click', close);
    dialog?.addEventListener('click', event => { if (event.target === dialog) close(); });
    media?.addEventListener?.('change', place);
    place();
  }

  return {SECTIONS, KEY, WIDE, normalize, move, setVisible, columns, mount, open:() => openDialog?.()};
});
