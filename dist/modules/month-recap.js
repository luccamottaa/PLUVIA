/* Últimos 30 dias: chuva acumulada, dias de chuva e extremos de temperatura da cidade aberta, numa
   única consulta Open-Meteo (past_days) feita só ao abrir o diálogo, com cliente próprio, cache curto
   em memória por cidade e revisão. Só entram dias completos do calendário municipal (hoje fica de
   fora). São estimativas do modelo, não medição de estação; dias ausentes nunca viram zero. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).monthRecap = api;
  if (root.document) api.mount(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
  const DAYS = 30;
  const FRESH_MS = 60 * 60 * 1000;
  const RAIN_DAY_MM = 1;
  // Total de chuva só com quase todos os dias; com menos, a soma subestimaria o mês.
  const MIN_RAIN_DAYS = 27;
  const MIN_TEMP_DAYS = 20;

  function buildUrl(city) {
    const url = new URL(ENDPOINT);
    url.searchParams.set('latitude', String(city.lat));
    url.searchParams.set('longitude', String(city.lon));
    url.searchParams.set('timezone', city.timezone);
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum');
    url.searchParams.set('past_days', String(DAYS));
    url.searchParams.set('forecast_days', '1');
    return url.href;
  }

  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const inRange = (value, min, max) => value !== null && value >= min && value <= max ? value : null;

  // today: data do calendário municipal (AAAA-MM-DD). Ficam os DAYS dias completos anteriores.
  function summarize(response, today) {
    const daily = response?.daily, dates = daily?.time;
    if (!Array.isArray(dates) || !/^\d{4}-\d{2}-\d{2}$/.test(String(today || ''))) throw Object.assign(new Error('Resposta do mês inválida.'), {code:'invalid_response'});
    const rows = [];
    dates.forEach((date, index) => {
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= today) return;
      rows.push({
        date,
        high:inRange(finite(daily.temperature_2m_max?.[index]), -60, 60),
        low:inRange(finite(daily.temperature_2m_min?.[index]), -60, 60),
        rain:inRange(finite(daily.precipitation_sum?.[index]), 0, 1000)
      });
    });
    const days = rows.sort((a, b) => a.date < b.date ? -1 : 1).slice(-DAYS);
    const rainDays = days.filter(day => day.rain !== null), highs = days.filter(day => day.high !== null), lows = days.filter(day => day.low !== null);
    const rainOk = rainDays.length >= MIN_RAIN_DAYS;
    const pick = (list, key, better) => list.reduce((best, day) => best === null || better(day[key], best[key]) ? day : best, null);
    const hottest = highs.length >= MIN_TEMP_DAYS ? pick(highs, 'high', (a, b) => a > b) : null;
    const coldest = lows.length >= MIN_TEMP_DAYS ? pick(lows, 'low', (a, b) => a < b) : null;
    const wettest = rainOk ? pick(rainDays, 'rain', (a, b) => a > b) : null;
    return {
      days,
      first:days[0]?.date || null,
      last:days.at(-1)?.date || null,
      covered:{rain:rainDays.length, temperature:Math.min(highs.length, lows.length), total:days.length},
      totalRain:rainOk ? Math.round(rainDays.reduce((sum, day) => sum + day.rain, 0) * 10) / 10 : null,
      rainyDays:rainOk ? rainDays.filter(day => day.rain >= RAIN_DAY_MM).length : null,
      wettest:wettest && wettest.rain >= RAIN_DAY_MM ? {date:wettest.date, value:wettest.rain} : null,
      hottest:hottest ? {date:hottest.date, value:hottest.high} : null,
      coldest:coldest ? {date:coldest.date, value:coldest.low} : null,
      meanHigh:highs.length >= MIN_TEMP_DAYS ? highs.reduce((sum, day) => sum + day.high, 0) / highs.length : null,
      meanLow:lows.length >= MIN_TEMP_DAYS ? lows.reduce((sum, day) => sum + day.low, 0) / lows.length : null
    };
  }

  // Frase curta para o topo do diálogo, sem adjetivar além do que os números dizem.
  function headline(summary) {
    if (!summary || summary.rainyDays === null) return '';
    const total = summary.covered.total;
    if (summary.rainyDays === 0) return `Nenhum dia com chuva de 1 mm ou mais nos últimos ${total} dias.`;
    if (summary.rainyDays === 1) return `Choveu 1 mm ou mais em 1 dos últimos ${total} dias.`;
    return `Choveu 1 mm ou mais em ${summary.rainyDays} dos últimos ${total} dias.`;
  }

  let openDialog = null;
  function mount(root) {
    const doc = root.document, el = id => doc.getElementById(id);
    const dialog = el('monthDialog'), body = el('monthBody');
    if (!dialog || !body) return;
    const client = root.PLUVIA?.http?.createClient?.({defaultTimeoutMs:12000});
    const cache = new Map();
    let revision = 0;
    const active = () => typeof activeCity !== 'undefined' ? activeCity : null;
    const status = text => {el('monthStatus').textContent = text;};
    const time = () => root.PLUVIA?.time;
    const number = (value, digits = 0) => time()?.numberFormat?.('pt-BR', {minimumFractionDigits:digits, maximumFractionDigits:digits})?.format(value) ?? value.toFixed(digits);
    const degrees = value => value === null ? '—' : Math.round(value) + '°';
    // Datas diárias são calendário: ancoradas em UTC e formatadas em UTC.
    const day = date => {
      const at = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), 12);
      return time()?.dateFormat?.('pt-BR', {day:'2-digit', month:'2-digit', timeZone:'UTC'})?.format(at) ?? `${date.slice(8, 10)}/${date.slice(5, 7)}`;
    };

    function stat(label, value, note) {
      const item = doc.createElement('div'), dt = doc.createElement('dt'), dd = doc.createElement('dd');
      dt.textContent = label; dd.textContent = value;
      item.append(dt, dd);
      if (note) {const small = doc.createElement('small'); small.textContent = note; dd.append(small);}
      return item;
    }

    // Barras de chuva por dia: altura proporcional só ao volume; dia sem leitura fica sem barra.
    function chart(summary) {
      const ns = 'http://www.w3.org/2000/svg', svg = doc.createElementNS(ns, 'svg');
      const width = summary.days.length * 10, height = 60;
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('focusable', 'false');
      const max = Math.max(5, ...summary.days.map(item => item.rain ?? 0));
      summary.days.forEach((item, index) => {
        const base = doc.createElementNS(ns, 'rect');
        base.setAttribute('class', item.rain === null ? 'month-bar-missing' : 'month-bar-track');
        base.setAttribute('x', String(index * 10 + 2)); base.setAttribute('y', String(height - 2)); base.setAttribute('width', '6'); base.setAttribute('height', '2');
        svg.append(base);
        if (!(item.rain >= 0.1)) return;
        const bar = doc.createElementNS(ns, 'rect'), h = Math.max(2, item.rain / max * (height - 4));
        bar.setAttribute('class', 'month-bar');
        bar.setAttribute('x', String(index * 10 + 2)); bar.setAttribute('y', (height - h).toFixed(1)); bar.setAttribute('width', '6'); bar.setAttribute('height', h.toFixed(1)); bar.setAttribute('rx', '2');
        svg.append(bar);
      });
      const box = doc.createElement('figure'); box.className = 'month-chart';
      const graphic = doc.createElement('div'); graphic.className = 'month-chart-bars'; graphic.setAttribute('aria-hidden', 'true'); graphic.append(svg);
      const axis = doc.createElement('figcaption'); axis.className = 'month-chart-axis';
      const start = doc.createElement('span'), end = doc.createElement('span');
      start.textContent = summary.first ? day(summary.first) : ''; end.textContent = summary.last ? day(summary.last) : '';
      const label = doc.createElement('span'); label.className = 'month-sr'; label.textContent = 'Chuva por dia, do mais antigo ao mais recente.';
      axis.append(start, label, end);
      box.append(graphic, axis);
      return box;
    }

    function render(city, summary) {
      const list = doc.createElement('dl'); list.className = 'month-stats';
      const partialRain = summary.covered.rain < summary.covered.total;
      list.append(
        stat('Chuva acumulada', summary.totalRain === null ? '—' : `${number(summary.totalRain, summary.totalRain < 10 ? 1 : 0)} mm`, summary.totalRain === null ? 'dados insuficientes' : partialRain ? `${summary.covered.rain} de ${summary.covered.total} dias com dado` : ''),
        stat('Dias com chuva', summary.rainyDays === null ? '—' : String(summary.rainyDays), summary.rainyDays === null ? '' : '1 mm ou mais'),
        stat('Dia mais chuvoso', summary.wettest ? `${number(summary.wettest.value, summary.wettest.value < 10 ? 1 : 0)} mm` : '—', summary.wettest ? day(summary.wettest.date) : ''),
        stat('Dia mais quente', degrees(summary.hottest?.value ?? null), summary.hottest ? day(summary.hottest.date) : ''),
        stat('Noite mais fria', degrees(summary.coldest?.value ?? null), summary.coldest ? day(summary.coldest.date) : ''),
        stat('Média máx./mín.', summary.meanHigh === null || summary.meanLow === null ? '—' : `${degrees(summary.meanHigh)}/${degrees(summary.meanLow)}`, '')
      );
      const lead = doc.createElement('p'); lead.className = 'month-lead'; lead.textContent = headline(summary);
      const nodes = [];
      if (lead.textContent) nodes.push(lead);
      nodes.push(list);
      if (summary.days.length && summary.covered.rain) nodes.push(chart(summary));
      body.replaceChildren(...nodes);
      el('monthCity').textContent = summary.first && summary.last ? `${city.name}/${city.uf} · ${day(summary.first)} a ${day(summary.last)}` : `${city.name}/${city.uf}`;
    }

    async function load() {
      const token = ++revision, city = active();
      body.replaceChildren();
      el('monthCity').textContent = city ? `${city.name}/${city.uf}` : '';
      if (!city || !Number.isFinite(city.lat) || !Number.isFinite(city.lon) || !city.timezone) {status('Escolha uma cidade para ver os últimos 30 dias.'); return;}
      const today = time()?.dayKey?.(Date.now(), city);
      const hit = cache.get(city.id);
      if (hit && hit.today === today && Date.now() - hit.at < FRESH_MS) {render(city, hit.summary); status('Estimativa do modelo · Open-Meteo'); return;}
      status('Consultando os últimos 30 dias…');
      try {
        if (!client?.getJson || !today) throw new Error('Cliente indisponível.');
        client.abortAll?.();
        const data = await client.getJson(buildUrl(city), {timeoutMs:12000, cache:'no-store'});
        if (token !== revision) return;
        const summary = summarize(data, today);
        if (!summary.days.length) throw Object.assign(new Error('Sem dias.'), {code:'invalid_response'});
        cache.set(city.id, {summary, today, at:Date.now()});
        if (cache.size > 8) cache.delete(cache.keys().next().value);
        render(city, summary); status('Estimativa do modelo · Open-Meteo');
      } catch (error) {
        if (token !== revision || error?.code === 'cancelled') return;
        status(root.navigator?.onLine === false ? 'Sem internet: não foi possível consultar os últimos 30 dias.' : 'Não foi possível consultar os últimos 30 dias agora. Tente novamente.');
      }
    }

    function open() {
      el('cityDialog')?.open && el('cityDialog').close();
      if (!dialog.open) dialog.showModal();
      dialog.querySelector('.dialog-scroll')?.scrollTo?.(0, 0);
      load();
    }
    openDialog = open;
    const stop = () => {revision++; client?.abortAll?.();};
    const close = () => root.PLUVIA?.dialogs?.close(dialog) ?? dialog.close();
    el('homeMonth')?.addEventListener('click', open);
    el('monthClose').addEventListener('click', close);
    dialog.addEventListener('click', event => {if (event.target === dialog) close();});
    dialog.addEventListener('close', stop);
    // Cidade nova: a leitura antiga não pode ficar à vista nem chegar depois.
    root.addEventListener('pluvia:city-changed', () => {if (dialog.open) {stop(); dialog.close();}});
  }

  return {buildUrl, summarize, headline, mount, DAYS, open:() => openDialog?.()};
});
