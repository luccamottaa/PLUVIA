/* Regras conservadoras: avisos oficiais confirmados por município e AQI modelado. */
(() => {
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
    const time = value => Number.isFinite(value) ? new Intl.DateTimeFormat('pt-BR',{timeZone:activeCity.timezone,dateStyle:'short',timeStyle:'short'}).format(value) : 'Não informado';
    const id = String(firstValue(alert,['id_aviso','id']));
    const url = /^\d+$/.test(id) ? `https://avisos.inmet.gov.br/${id}` : 'https://alertas2.inmet.gov.br/';
    const risks = firstValue(alert,['riscos','description'],'Não informados nesta resposta. Consulte o aviso oficial.');
    const recommendations = firstValue(alert,['instrucoes','recomendacoes','orientacoes','instruction'],'Não informadas nesta resposta. Consulte o aviso oficial.');
    const codes = (JSON.stringify(alert.geocodes || alert.geocode || '').match(/\b\d{7}\b/g) || []);
    const municipalities = codes.length ? codes.map(code=>{const c=cityById.get(code);return c ? `${c.name}/${c.uf} (${code})` : `IBGE ${code}`;}).join(', ') : text(alert.municipios || alert.municipio || 'Lista não informada');
    $('alertDetailTitle').textContent = decodeHtml(text(firstValue(alert,['descricao','evento','titulo','tipo'],'Aviso INMET')));
    $('alertDetailBody').innerHTML = `<p><strong>${clean(severity.label)} · ${clean(severity.description)}</strong></p><p>${current ? 'Fonte: INMET · Dado oficial' : 'Leitura anterior, sem confirmação atual.'}</p><p>${validity}</p><dl><dt>Início</dt><dd>${time(start)}</dd><dt>Término</dt><dd>${time(end)}</dd><dt>Fuso</dt><dd>${clean(activeCity.timezone)}</dd><dt>Abrangência</dt><dd>${clean(area)}</dd><dt>Municípios afetados</dt><dd>${clean(municipalities)}</dd><dt>Descrição e riscos</dt><dd>${clean(risks)}</dd><dt>Recomendações oficiais</dt><dd>${clean(recommendations)}</dd></dl>${/enxurrada/i.test(text(risks)) ? '<details><summary>O que significa enxurrada?</summary><p>A água pode subir e correr rapidamente em ruas, igarapés e áreas baixas após chuva intensa.</p></details>' : ''}<a href="${url}" target="_blank" rel="noreferrer">Abrir aviso oficial no INMET ↗</a>`;
    $('alertDetail').showModal(); $('alertDetailClose').focus();
  }
  app.modules.ui.refresh = () => {};
  document.addEventListener('click',event=>{ const button=event.target.closest('[data-notice]');if(button)showDetail(Number(button.dataset.notice)); });
  $('alertDetailClose').addEventListener('click',()=>$('alertDetail').close());
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
