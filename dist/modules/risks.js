/* Regras conservadoras: avisos oficiais confirmados por município e AQI modelado. */
(() => {
  const dateFormat=(locale,options)=>globalThis.PLUVIA?.time?.dateFormat?.(locale,options) ?? new Intl.DateTimeFormat(locale,options);
  const app = globalThis.PLUVIA;
  let notices = [], staleNotices = true;
  const text = value => Array.isArray(value) ? value.map(text).join('; ') : value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
  const clean = value => escapeHtml(decodeHtml(text(value)));
  function assess(items, sources, aqi, now = Date.now()) {
    const fresh = id => sources[id]?.status === 'ready';
    const active = items.filter(item => item.stage !== 'unconfirmed' && item.start <= now && item.end > now && item.confirmed);
    const uncertain = items.some(item => !(Number.isFinite(item.end) && item.end <= now) && (!item.confirmed || item.stage === 'unconfirmed' || !item.severity.rank));
    const incomplete = !fresh('alerts') || !fresh('weather') || !fresh('air-quality') || !Number.isFinite(aqi) || aqi < 0 || uncertain;
    const officialRank = fresh('alerts') ? Math.max(0,...active.map(item=>item.severity.rank)) : 0;
    const airRank = fresh('air-quality') && Number.isFinite(aqi) ? aqi > 200 ? 2 : aqi > 100 ? 1 : 0 : 0;
    const rank = Math.max(officialRank,airRank);
    return {rank,incomplete,active:fresh('alerts') ? active : [],airRank,label:rank ? ['','🟡 Atenção','🟠 Risco elevado','🔴 Risco extremo'][rank] : incomplete ? 'Monitoramento incompleto' : '🟢 Risco baixo'};
  }
  app.modules.alerts.assess = assess;
  app.modules.alerts.receive = (raw, stale) => { notices = selectInmetAlerts(raw); staleNotices = stale; };
  app.modules.location.reset = () => { notices=[]; staleNotices=true; };
  function showDetail(index) {
    const item = notices[index]; if(!item) return;
    const {alert,area,start,end,severity} = item;
    const current = app.sources.get('alerts').status === 'ready' && !staleNotices;
    const validity = Number.isFinite(end) && end <= Date.now() ? 'Aviso encerrado pelo horário de término.' : start > Date.now() ? 'Aviso previsto; ainda não está vigente.' : item.stage === 'unconfirmed' ? 'Vigência a confirmar no INMET.' : 'Aviso vigente pelo período informado.';
    const time = value => Number.isFinite(value) ? dateFormat('pt-BR',{timeZone:activeCity.timezone,dateStyle:'short',timeStyle:'short'}).format(value) : 'Não informado';
    const id = String(firstValue(alert,['id_aviso','id']));
    const url = /^\d+$/.test(id) ? `https://avisos.inmet.gov.br/${id}` : 'https://alertas2.inmet.gov.br/';
    const risks = firstValue(alert,['riscos','description'],'Não informados nesta resposta. Consulte o aviso oficial.');
    const recommendations = firstValue(alert,['instrucoes','recomendacoes','orientacoes','instruction'],'Não informadas nesta resposta. Consulte o aviso oficial.');
    const codes = (JSON.stringify(alert.geocodes || alert.geocode || '').match(/\b\d{7}\b/g) || []);
    const municipalities = codes.length ? codes.map(code=>{const c=cityById.get(code);return c ? `${c.name}/${c.uf} (${code})` : `IBGE ${code}`;}).join(', ') : text(alert.municipios || alert.municipio || 'Lista não informada');
    $('alertDetailTitle').textContent = decodeHtml(text(firstValue(alert,['descricao','evento','titulo','tipo'],'Aviso INMET')));
    $('alertDetailBody').innerHTML = `<div class="inmet-detail-summary inmet-${severity.className}"><span class="inmet-alert-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg></span><div><span class="inmet-level">${clean(severity.label)}</span><p>${clean(severity.description)}</p></div></div>
      <p class="inmet-detail-source">${current ? 'Fonte: INMET · Dado oficial' : 'Leitura anterior, sem confirmação atual.'}</p><p class="inmet-detail-validity">${validity}</p>
      <dl class="inmet-detail-times"><div><dt>Início</dt><dd>${time(start)}</dd></div><div><dt>Término</dt><dd>${time(end)}</dd></div><div><dt>Fuso</dt><dd>${clean(activeCity.timezone)}</dd></div></dl>
      <dl class="inmet-detail-sections"><div><dt>Abrangência</dt><dd>${clean(area)}</dd></div><div><dt>Municípios afetados</dt><dd>${clean(municipalities)}</dd></div><div><dt>Descrição e riscos</dt><dd>${clean(risks)}</dd></div><div><dt>Recomendações oficiais</dt><dd>${clean(recommendations)}</dd></div></dl>
      ${/enxurrada/i.test(text(risks)) ? '<details><summary>O que significa enxurrada?</summary><p>A água pode subir e correr rapidamente em ruas, igarapés e áreas baixas após chuva intensa.</p></details>' : ''}<a class="inmet-official-link" href="${url}" target="_blank" rel="noreferrer">Abrir aviso oficial no INMET <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></a>`;
    // Com a faixa no topo o cartão completo some: os outros avisos da região ficam aqui, um toque cada.
    const others = notices.map((other,i)=>({other,i})).filter(({i})=>i!==index);
    if (others.length) $('alertDetailBody').insertAdjacentHTML('beforeend', `<div class="inmet-detail-others"><h3>Outros avisos na região</h3>${others.map(({other,i})=>{
      const stage = other.stage==='future' ? 'Previsto' : other.stage==='active' ? 'Vigente' : 'A confirmar';
      return `<button type="button" class="inmet-detail-other inmet-${clean(other.severity.className)}" data-notice="${i}"><strong>${clean(firstValue(other.alert,['descricao','evento','titulo','tipo'],'Aviso INMET'))}</strong><small>${clean(other.severity.label)} · ${stage} · ${clean(other.area)}</small><span aria-hidden="true">›</span></button>`;}).join('')}</div>`);
    $('alertDetailBody').scrollTop = 0;
    if (!$('alertDetail').open) $('alertDetail').showModal();
    $('alertDetailClose').focus();
  }
  app.modules.ui.refresh = () => {};
  document.addEventListener('click',event=>{ const button=event.target.closest('[data-notice]');if(button)showDetail(Number(button.dataset.notice)); });
  $('alertDetailClose').addEventListener('click',()=>globalThis.PLUVIA?.dialogs?.close($('alertDetail')) ?? $('alertDetail').close());
  function tick() {
    if (activeCity && lastInmetResponse) {
      const stale = app.sources.get('alerts').status !== 'ready';
      renderInmetAlerts(lastInmetResponse, stale);
      updateInmetTimestamp(stale);
    }
  }
  setInterval(tick,60000);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) tick(); });
})();
