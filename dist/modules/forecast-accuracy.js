/* Quanto o PLUVIA acerta (1.37, pedido do dono): na janela "Últimos 30 dias", uma seção compara a resposta
   "Vai chover?" do modelo que a tela usa com a estação do INMET mais próxima, nas próximas 3 h e 12 h
   (RPC pluvia_forecast_accuracy, só totais). Por enquanto só as capitais são medidas: outra cidade vê a capital do
   estado, dito na tela. Mostra os dois lados (chuvas avisadas e alarmes que não deram em nada) e só com casos
   suficientes; "pode chover" não conta como acerto nem como erro. Consulta só ao abrir, com cliente próprio,
   cache curto e revisão. 1.75: a janela de 3 h vem primeiro e em destaque, os alarmes falsos aparecem escritos e
   uma frase diz, com o número da cidade quando há, que acertar a hora exata é bem mais difícil. */
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
    return {since, windows, any, hourly:hourly(response?.hourly)};
  }
  // Hora exata (1.75): das horas em que a previsão feita `lead` horas antes marcou chuva, em quantas choveu
  // naquela hora. Sem a chave (banco antigo) ou com poucos casos: null, e a tela diz a frase sem número.
  function hourly(row) {
    const [lead, hits, alarms] = [row?.lead_hours, row?.hits, row?.false_alarms].map(count);
    if (lead === null || hits === null || alarms === null) return null;
    const right = share(hits, hits + alarms);
    return right ? {lead, right} : null;
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
      // 3 horas primeiro e em destaque (é a janela do "Vai chover?"); depois a hora exata e as 12 horas.
      for (const [hours, title] of [[3, 'Nas próximas 3 horas'], [12, 'Nas próximas 12 horas']]) {
        const item = summary.windows[hours];
        if (item) {
          const block = doc.createElement('div'); block.className = hours === 3 ? 'accuracy-block accuracy-main' : 'accuracy-block';
          const heading = doc.createElement('h4'); heading.className = 'accuracy-window'; heading.textContent = title;
          const list = doc.createElement('dl'); list.className = 'month-stats accuracy-stats';
          list.append(
            stat('Chuvas que ele avisou', item.caught, v => `${v.part} de ${v.total} chuvas medidas`),
            // Os alarmes falsos ficam escritos, não só implícitos na porcentagem.
            stat('Disse “vai chover” e choveu', item.rainRight, v => `${v.part} de ${v.total} vezes; nas outras ${v.total - v.part}, não choveu`),
            stat('Disse “não vai chover” e ficou seco', item.dryRight, v => `${v.part} de ${v.total} vezes`)
          );
          block.append(heading, list);
          nodes.push(block);
        }
        if (hours === 3) nodes.push(exactHour(summary.hourly));
      }
      box.replaceChildren(...nodes);
    }
    function exactHour(hour) {
      const p = doc.createElement('p'); p.className = 'accuracy-hour';
      p.textContent = hour
        ? `Na hora exata é bem mais difícil: das ${hour.right.total} horas em que a previsão feita ${hour.lead} horas antes marcou chuva, choveu naquela hora em ${hour.right.part} (${hour.right.pct}%). Por isso o PLUVIA fala em janelas, como “nas próximas 3 horas”, e não em horário marcado.`
        : 'Acertar a hora exata da chuva é bem mais difícil do que acertar uma janela de horas. Por isso o PLUVIA fala em janelas, como “nas próximas 3 horas”, e não em horário marcado.';
      return p;
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

  return {summarize, hourly, target, mount, MIN_CASES};
});
