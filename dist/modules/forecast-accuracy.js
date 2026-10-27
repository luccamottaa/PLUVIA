/* Quanto o PLUVIA acerta (1.37, pedido do dono): na janela "Últimos 30 dias", uma seção compara a resposta
   "Vai chover?" do modelo que a tela usa com a estação do INMET mais próxima, nas próximas 3 h e 12 h
   (RPC pluvia_forecast_accuracy, só totais). Por enquanto só as capitais são medidas: outra cidade vê a capital do
   estado, dito na tela. Mostra os dois lados (chuvas avisadas e alarmes que não deram em nada) e só com casos
   suficientes; "pode chover" não conta como acerto nem como erro. Consulta só ao abrir, com cliente próprio,
   cache curto e revisão. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).accuracy = api;
  if (root.document) api.mount(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const PROJECT = 'https://dszyyrcvwrpyiypwyvxe.supabase.co';
  const KEY = 'sb_publishable_SdPTXhk3Q7aD-ra0S9dm_A_rnXSS4Jc';
  const MIN_CASES = 5, FRESH_MS = 30 * 60 * 1000;
  const count = value => Number.isInteger(value) && value >= 0 ? value : null;
  function share(part, total) { return part !== null && total !== null && total >= MIN_CASES && part <= total ? {part, total, pct:Math.round(part / total * 100)} : null; }

  // Resposta do RPC → por janela: chuvas avisadas, "vai chover" que choveu e "não vai chover" que ficou seco.
  function summarize(response) {
    const rows = Array.isArray(response?.windows) ? response.windows : [];
    const windows = {};
    for (const row of rows) {
      const hours = row?.hours;
      if (hours !== 3 && hours !== 12) continue;
      const [rained, hits, alarms, saidDry, dryRight, total] = [row.rained, row.hits, row.false_alarms, row.said_dry, row.dry_right, row.windows].map(count);
      if ([rained, hits, alarms, saidDry, dryRight, total].includes(null)) continue;
      windows[hours] = {total, rained, caught:share(hits, rained), rainRight:share(hits, hits + alarms), dryRight:share(dryRight, saidDry)};
    }
    const since = typeof response?.since === 'string' && Number.isFinite(Date.parse(response.since)) ? Date.parse(response.since) : null;
    const any = Object.values(windows).some(item => item.caught || item.rainRight || item.dryRight);
    return {since, windows, any};
  }

  function target(city, capitals) {
    if (!city?.id) return null;
    if (capitals.some(item => item.id === city.id)) return {id:city.id, name:city.name, own:true};
    const capital = capitals.find(item => item.uf === city.uf);
    return capital ? {id:capital.id, name:capital.name, own:false} : null;
  }

  function mount(root) {
    const doc = root.document, el = id => doc.getElementById(id);
    const box = el('accuracyBody'), dialog = el('monthDialog');
    if (!box || !dialog) return;
    const client = root.PLUVIA?.http?.createClient?.({defaultTimeoutMs:8000});
    const cache = new Map();
    let revision = 0;
    const capitals = () => typeof CAPITALS !== 'undefined' && Array.isArray(CAPITALS) ? CAPITALS : [];
    const active = () => typeof activeCity !== 'undefined' ? activeCity : null;
    const status = text => {el('accuracyStatus').textContent = text;};
    const day = at => root.PLUVIA?.time?.dateFormat?.('pt-BR', {day:'2-digit', month:'2-digit', timeZone:'America/Sao_Paulo'})?.format(at) ?? new Date(at).toLocaleDateString('pt-BR');

    function stat(label, value, note) {
      const item = doc.createElement('div'), dt = doc.createElement('dt'), dd = doc.createElement('dd');
      dt.textContent = label; dd.textContent = value ? `${value.pct}%` : '—';
      const small = doc.createElement('small'); small.textContent = value ? note(value) : 'ainda poucos casos'; dd.append(small);
      item.append(dt, dd); return item;
    }
    function render(place, summary) {
      const nodes = [];
      const lead = doc.createElement('p'); lead.className = 'month-lead';
      const where = place.own ? place.name : `${place.name} (capital do estado; por enquanto só medimos nas capitais)`;
      lead.textContent = summary.since ? `Desde ${day(summary.since)}, a previsão comparada com o que a estação do INMET mais próxima mediu em ${where}.` : `Previsão comparada com a estação do INMET em ${where}.`;
      nodes.push(lead);
      for (const [hours, title] of [[12, 'Nas próximas 12 horas'], [3, 'Nas próximas 3 horas']]) {
        const item = summary.windows[hours]; if (!item) continue;
        const heading = doc.createElement('h4'); heading.className = 'accuracy-window'; heading.textContent = title;
        const list = doc.createElement('dl'); list.className = 'month-stats accuracy-stats';
        list.append(
          stat('Chuvas que ele avisou', item.caught, v => `${v.part} de ${v.total} chuvas medidas`),
          stat('Disse “vai chover” e choveu', item.rainRight, v => `${v.part} de ${v.total} vezes`),
          stat('Disse “não vai chover” e ficou seco', item.dryRight, v => `${v.part} de ${v.total} vezes`)
        );
        nodes.push(heading, list);
      }
      box.replaceChildren(...nodes);
    }
    async function load() {
      const token = ++revision, place = target(active(), capitals());
      box.replaceChildren();
      if (!place) {status('Ainda não medimos o acerto nesta região.'); return;}
      const hit = cache.get(place.id);
      if (hit && Date.now() - hit.at < FRESH_MS) {show(place, hit.summary); return;}
      status('Consultando o placar…');
      try {
        if (!client?.getJson) throw new Error('Cliente indisponível.');
        client.abortAll?.();
        const data = await client.getJson(`${PROJECT}/rest/v1/rpc/pluvia_forecast_accuracy?p_city=${encodeURIComponent(place.id)}`, {timeoutMs:8000, cache:'no-store', headers:{apikey:KEY, Authorization:`Bearer ${KEY}`}});
        if (token !== revision) return;
        const summary = summarize(data);
        cache.set(place.id, {summary, at:Date.now()}); if (cache.size > 8) cache.delete(cache.keys().next().value);
        show(place, summary);
      } catch (error) {
        if (token !== revision || error?.code === 'cancelled') return;
        status(root.navigator?.onLine === false ? 'Sem internet: o placar não pôde ser consultado.' : 'Não foi possível consultar o placar agora.');
      }
    }
    function show(place, summary) {
      if (!summary.any) {box.replaceChildren(); status(`Ainda não há casos suficientes em ${place.name} para dizer quanto o PLUVIA acerta.`); return;}
      render(place, summary); status('');
    }
    const stop = () => {revision++; client?.abortAll?.();};
    // Abre junto com "Últimos 30 dias" (mesma janela); o atalho próprio rola até a seção.
    let observer = null;
    try { observer = new root.MutationObserver(() => { if (dialog.open) load(); else stop(); }); observer.observe(dialog, {attributes:true, attributeFilter:['open']}); } catch (_) { /* sem observer: só pelo atalho */ }
    el('homeAccuracy')?.addEventListener('click', () => {
      root.PLUVIA?.monthRecap?.open?.();
      root.requestAnimationFrame?.(() => el('accuracyTitle')?.scrollIntoView?.({block:'start'}));
    });
  }

  return {summarize, target, mount, MIN_CASES};
});
