/* Personalizar a Home: mostrar/esconder e reordenar as seções abaixo do topo (salvo só neste aparelho)
   e, a partir de 1100 px, distribuí-las em duas colunas. O topo (cidade, temperatura e avisos)
   é fixo; as dicas são uma seção depois de Próximas horas. Seções escondidas ficam fora do layout (o radar escondido nem é consultado). Sem timer:
   aplica na abertura, ao mudar a escolha e quando a largura cruza o limite.
   Dobra (1.69): no celular, as seções de detalhe que ficam no fim da ordem (leituras, radar e céu) começam
   recolhidas atrás do botão "Mais detalhes". Recolhida é fora do layout, como a escondida: o radar nem é consultado. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).homeLayout = api;
  if (root.document) api.mount(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const KEY = 'pluvia-home-layout', MORE_KEY = 'pluvia-home-more';
  const WIDE = '(min-width: 1100px)';
  const SECTIONS = [
    {id:'hourly', label:'Próximas horas e 7 dias', selector:'section.hourly-peek', column:'left'},
    {id:'tips', label:'Dicas para as próximas horas', selector:'#tips', column:'left'},
    {id:'details', label:'Leituras, UV e qualidade do ar', selector:'section.metrics', column:'right', extra:true, short:'Vento, UV e ar'},
    {id:'radar', label:'Radar de chuva', selector:'section.weather-map-section', column:'left', extra:true, short:'Radar'},
    {id:'sky', label:'Ciclo do dia, Lua e céu', selector:'section.sun-section', column:'right', extra:true, short:'Sol e Lua'}
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

  // Dobra da Home: as seções de detalhe visíveis que fecham a ordem. Quem subiu o radar para antes das horas
  // continua vendo o radar; se só sobraram seções de detalhe, nada é recolhido (a Home não pode ficar só com o botão).
  function folded(layout) {
    const byId = new Map(SECTIONS.map(section => [section.id, section]));
    const visible = layout.order.filter(id => !layout.hidden.includes(id));
    let start = visible.length;
    while (start > 0 && byId.get(visible[start - 1]).extra) start--;
    return start === 0 ? [] : visible.slice(start);
  }
  function foldHint(ids) {
    return ids.map(id => SECTIONS.find(section => section.id === id)?.short).filter(Boolean).join(' · ');
  }

  let openDialog = null, revealSection = null;
  function mount(root) {
    const doc = root.document, view = doc.getElementById('weatherView');
    if (!view) return;
    const read = () => { try { return normalize(JSON.parse(root.localStorage.getItem(KEY) || 'null')); } catch { return normalize(null); } };
    const write = layout => { try { root.localStorage.setItem(KEY, JSON.stringify(layout)); } catch {} };
    const nodes = new Map(SECTIONS.map(section => [section.id, view.querySelector(':scope > ' + section.selector) || view.querySelector(section.selector)]));
    // As seções vêm depois do topo fixo: o convite de avisos fica logo abaixo dos alertas. As dicas agora são uma
    // seção da Personalização (depois de Próximas horas e 7 dias).
    const fixed = ['#alertNudge'].map(selector => view.querySelector(':scope > ' + selector)).filter(Boolean);
    const anchor = fixed[fixed.length - 1] || null;
    const media = root.matchMedia?.(WIDE);
    const more = doc.getElementById('homeMore');
    const moreLabel = more?.querySelector('.home-more-label'), moreHint = more?.querySelector('.home-more-hint');
    const readMore = () => { try { return root.localStorage.getItem(MORE_KEY) === '1'; } catch { return false; } };
    const writeMore = open => { try { if (open) root.localStorage.setItem(MORE_KEY, '1'); else root.localStorage.removeItem(MORE_KEY); } catch {} };
    let layout = read(), wrapper = null, expanded = readMore();

    function place() {
      const wide = Boolean(media?.matches);
      const fold = more && !wide ? folded(layout).filter(id => nodes.get(id)) : [];
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
          // O botão da dobra fica logo antes da primeira seção recolhível.
          if (id === fold[0]) { if (reference) after(more, reference); else if (view.lastElementChild !== more) view.append(more); reference = more; }
          if (reference) after(node, reference); else if (view.lastElementChild !== node) view.append(node);
          reference = node;
        }
        wrapper?.remove(); wrapper = null;
      }
      for (const [id, node] of nodes) {
        const hide = layout.hidden.includes(id);
        if (node && node.hasAttribute('data-home-hidden') !== hide) node.toggleAttribute('data-home-hidden', hide);
        const tuck = !expanded && fold.includes(id);
        if (node && node.hasAttribute('data-home-folded') !== tuck) node.toggleAttribute('data-home-folded', tuck);
      }
      if (more) {
        const show = fold.length > 0;
        if (more.hidden === show) more.hidden = !show;
        if (show) {
          const label = expanded ? 'Menos detalhes' : 'Mais detalhes', hint = foldHint(fold);
          if (more.getAttribute('aria-expanded') !== String(expanded)) more.setAttribute('aria-expanded', String(expanded));
          if (moreLabel && moreLabel.textContent !== label) moreLabel.textContent = label;
          if (moreHint && moreHint.textContent !== hint) moreHint.textContent = hint;
        }
      }
      root.dispatchEvent?.(new CustomEvent('pluvia:home-layout', {detail:{layout, wide, expanded}}));
    }

    const dialog = doc.getElementById('homeLayoutDialog'), list = doc.getElementById('homeLayoutList');
    function render(focus) {
      if (!list) return;
      const label = id => SECTIONS.find(section => section.id === id).label;
      list.replaceChildren(...layout.order.map((id, index) => {
        const item = doc.createElement('li'), check = doc.createElement('label'), box = doc.createElement('input'), name = doc.createElement('span');
        item.dataset.section = id; // ícone da seção na lista (1.65)
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
    more?.addEventListener('click', () => {
      expanded = !expanded; writeMore(expanded); place();
      // Ao recolher, a página encurta: o botão continua à vista, sem rolagem animada.
      if (!expanded) more.scrollIntoView?.({block:'nearest'});
    });
    // Atalhos que abrem algo de uma seção recolhida (radar) mostram os detalhes só nesta visita, sem gravar.
    revealSection = id => { if (!expanded && folded(layout).includes(id)) { expanded = true; place(); } };
    media?.addEventListener?.('change', place);
    place();
  }

  return {SECTIONS, KEY, MORE_KEY, WIDE, normalize, move, setVisible, columns, folded, foldHint, mount, open:() => openDialog?.(), reveal:id => revealSection?.(id)};
});
