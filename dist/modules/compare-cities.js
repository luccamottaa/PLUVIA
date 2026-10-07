/* Comparar cidades: a cidade aberta ao lado de um favorito, local salvo ou capital.
   A cidade aberta reaproveita a previsão já exibida (sem novo request); a outra é consultada
   só ao abrir o diálogo ou trocar a escolha, com cliente próprio, cache curto em memória e
   revisão para descartar respostas atrasadas. As duas colunas passam pelo mesmo resumo. */
(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports
    ? {time:require('./city-time.js'), insights:require('./weather-insights.js')}
    : {time:root.PLUVIA?.time, insights:root.PLUVIA?.weatherInsights});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).compare = api;
  if (root.document) api.mount(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(deps) {
  'use strict';
  const {time, insights} = deps;
  const FRESH_MS = 20 * 60 * 1000, HORIZON = 12;
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

  // Resumo comparável de uma cidade. Valores ausentes ficam null (nunca viram zero).
  function summarize(forecast, air, city, now = Date.now()) {
    const current = forecast?.current, hourly = forecast?.hourly || {}, times = hourly.time || [];
    if (finite(current?.temperature_2m) === null || !city?.timezone) return null;
    const start = times.length ? time.hourIndex(times, city, now) : -1;
    const day = time.dayKey(now, city), dailyIndex = forecast.daily?.time?.indexOf(day) ?? -1;
    const rain = insights?.rainAnswer?.(hourly, start, {horizon:HORIZON, current}) || {tone:'unknown', text:'Previsão de chuva indisponível.', hours:0};
    // Volume das próximas horas no intervalo que termina em i+1, só com a série completa.
    let volume = null;
    if (start >= 0 && rain.hours > 0) {
      const values = [];
      for (let index = start; index < start + rain.hours; index += 1) values.push(finite(hourly.precipitation?.[index + 1]));
      if (values.every(value => value !== null && value >= 0)) volume = values.reduce((sum, value) => sum + value, 0);
    }
    const aqi = finite(air?.current?.us_aqi);
    return {
      temperature:current.temperature_2m, feelsLike:finite(current.apparent_temperature),
      code:finite(current.weather_code), isDay:current.is_day !== 0,
      high:dailyIndex >= 0 ? finite(forecast.daily?.temperature_2m_max?.[dailyIndex]) : null,
      low:dailyIndex >= 0 ? finite(forecast.daily?.temperature_2m_min?.[dailyIndex]) : null,
      rain, rainHours:rain.hours || 0, volume, aqi:aqi !== null && aqi >= 0 ? aqi : null
    };
  }

  // Opções sem repetir cidade: locais salvos (com o nome pessoal), favoritos e capitais.
  function options({places = [], favorites = [], capitals = [], activeId = null, names = new Map()} = {}) {
    const seen = new Set(activeId ? [activeId] : []), groups = [];
    const add = (label, items) => {
      const list = [];
      for (const item of items) if (/^\d{7}$/.test(item.id) && !seen.has(item.id)) {seen.add(item.id); list.push(item);}
      if (list.length) groups.push({label, items:list});
    };
    add('Meus locais', places.map(place => ({id:String(place.cityId), label:`${place.name} · ${place.cityName}/${place.uf}`})));
    add('Favoritos', favorites.map(id => ({id:String(id), label:names.get(String(id)) || 'Cidade favorita'})));
    add('Capitais', capitals.map(city => ({id:String(city.id), label:`${city.name}/${city.uf}`})));
    return groups;
  }

  let openDialog = null;
  function mount(root) {
    const doc = root.document, el = id => doc.getElementById(id);
    const dialog = el('compareDialog'), select = el('compareCity'), table = el('compareTable');
    if (!dialog || !select || !table) return;
    const service = root.PLUVIA?.services?.createServices?.({client:root.PLUVIA?.http?.createClient?.({defaultTimeoutMs:10000})});
    const cache = new Map();
    let revision = 0, controller = null, chosen = null;
    const active = () => typeof activeCity !== 'undefined' ? activeCity : null;
    const status = text => {el('compareStatus').textContent = text;};
    const cityName = city => city ? `${city.name}/${city.uf}` : 'Cidade';

    function fill() {
      const city = active();
      const names = new Map();
      const favoriteIds = typeof favorites !== 'undefined' ? [...favorites] : [];
      for (const id of favoriteIds) {const known = typeof cityById !== 'undefined' ? cityById.get(String(id)) : null; if (known) names.set(String(id), cityName(known));}
      const capitals = typeof CAPITALS !== 'undefined' ? CAPITALS : [];
      const groups = options({places:root.PLUVIA?.savedPlaces?.list?.() || [], favorites:favoriteIds, capitals, activeId:city?.id, names});
      select.replaceChildren(...groups.map(group => {
        const node = doc.createElement('optgroup'); node.label = group.label;
        node.append(...group.items.map(item => {const option = doc.createElement('option'); option.value = item.id; option.textContent = item.label; return option;}));
        return node;
      }));
      const ids = groups.flatMap(group => group.items.map(item => item.id));
      select.value = ids.includes(chosen) ? chosen : ids[0] || '';
      el('compareCityLabel').textContent = `Comparar ${city ? city.name : 'a cidade aberta'} com`;
    }

    function cell(value, detail) {
      const td = doc.createElement('td');
      const strong = doc.createElement('strong'); strong.textContent = value; td.append(strong);
      if (detail) {const small = doc.createElement('small'); small.textContent = detail; td.append(small);}
      return td;
    }
    const degrees = value => value === null ? '—' : Math.round(value) + '°';
    function columns(summary, state) {
      if (!summary) {
        const text = state === 'loading' ? 'Consultando…' : 'Indisponível';
        return {now:[text], feels:[text], range:[text], rain:[text], air:[text]};
      }
      const label = root.PLUVIA?.weatherIcons?.condition?.(summary.code, summary.isDay)?.label || 'Condição prevista';
      const air = typeof aqiLabel === 'function' ? aqiLabel(summary.aqi) : [summary.aqi === null ? '—' : String(Math.round(summary.aqi)), ''];
      const volume = summary.volume === null ? '' : `${summary.volume.toLocaleString('pt-BR', {maximumFractionDigits:1})} mm em ${summary.rainHours}h`;
      return {
        now:[degrees(summary.temperature), label],
        feels:[degrees(summary.feelsLike)],
        range:[summary.high === null || summary.low === null ? '—' : `${Math.round(summary.high)}° / ${Math.round(summary.low)}°`],
        rain:[summary.rain.text, volume],
        air:summary.aqi === null ? ['—', 'AQI indisponível'] : [air[0], air[1] || `AQI ${Math.round(summary.aqi)}`]
      };
    }
    function render(left, right) {
      const [a, b] = [columns(left.summary, left.state), columns(right.summary, right.state)];
      const head = doc.createElement('thead'), row = doc.createElement('tr');
      const corner = doc.createElement('td');
      row.append(corner, ...[left, right].map(side => {
        const th = doc.createElement('th'); th.scope = 'col'; th.textContent = side.name;
        if (side.note) {const small = doc.createElement('small'); small.textContent = side.note; th.append(small);}
        return th;
      }));
      head.append(row);
      const body = doc.createElement('tbody');
      for (const [key, title] of [['now','Agora'], ['feels','Sensação'], ['range','Máx./mín. hoje'], ['rain',`Chuva em ${HORIZON}h`], ['air','Qualidade do ar']]) {
        const tr = doc.createElement('tr'), th = doc.createElement('th');
        th.scope = 'row'; th.textContent = title;
        tr.append(th, cell(...a[key]), cell(...b[key]));
        body.append(tr);
      }
      // Papéis explícitos: em telas estreitas o CSS troca o display das linhas para grid.
      table.setAttribute('role', 'table');
      for (const node of [...head.querySelectorAll('tr'), ...body.querySelectorAll('tr')]) node.setAttribute('role', 'row');
      for (const node of head.querySelectorAll('th')) node.setAttribute('role', 'columnheader');
      for (const node of body.querySelectorAll('th')) node.setAttribute('role', 'rowheader');
      for (const node of [...head.querySelectorAll('td'), ...body.querySelectorAll('td')]) node.setAttribute('role', 'cell');
      const caption = doc.createElement('caption'); caption.className = 'sr-only';
      caption.textContent = `Comparação entre ${left.name} e ${right.name}`;
      table.replaceChildren(caption, head, body);
    }

    function leftSide() {
      const city = active(), shown = typeof displayedWeather !== 'undefined' ? displayedWeather : null;
      const summary = shown?.forecast ? summarize(shown.forecast, shown.air, city) : null;
      return {name:city ? city.name : 'Cidade aberta', summary, state:summary ? 'ready' : 'loading',
        note:summary && shown.fromCache ? 'leitura salva' : ''};
    }

    async function compare() {
      const id = select.value, token = ++revision;
      controller?.abort(); controller = null;
      chosen = id || null;
      if (!id) {status('Escolha uma cidade para comparar.'); table.replaceChildren(); return;}
      const known = typeof cityById !== 'undefined' ? cityById.get(id) : null;
      const right = {name:known ? known.name : 'Cidade escolhida', summary:null, state:'loading', note:''};
      const hit = cache.get(id);
      if (hit && Date.now() - hit.at < FRESH_MS) {
        right.summary = summarize(hit.forecast, hit.air, hit.city); right.state = 'ready';
        render(leftSide(), right); status(''); return;
      }
      render(leftSide(), right); status('Consultando a previsão de ' + right.name + '…');
      const signal = (controller = new AbortController()).signal;
      try {
        const city = await ensureCityDetails(id);
        if (token !== revision) return;
        if (!city) throw Object.assign(new Error('city'), {code:'city'});
        right.name = city.name;
        const [weather, air] = await Promise.allSettled([
          service.weather.getCompare(city, {signal, timeoutMs:10000}),
          service.airQuality.getCurrent(city, {signal, timeoutMs:10000})
        ]);
        if (token !== revision) return;
        if (weather.status !== 'fulfilled') throw weather.reason;
        const airData = air.status === 'fulfilled' ? air.value : null;
        right.summary = summarize(weather.value, airData, city);
        if (!right.summary) throw Object.assign(new Error('data'), {code:'invalid_response'});
        right.state = 'ready';
        cache.set(id, {forecast:weather.value, air:airData, city, at:Date.now()});
        if (cache.size > 12) cache.delete(cache.keys().next().value);
        render(leftSide(), right);
        status(airData ? '' : 'Qualidade do ar indisponível para ' + city.name + ' agora.');
      } catch (error) {
        if (token !== revision || error?.code === 'cancelled' || signal.aborted) return;
        right.state = 'error'; render(leftSide(), right);
        status(root.navigator?.onLine === false ? 'Sem internet: não foi possível consultar ' + right.name + '.' : 'Não foi possível consultar ' + right.name + '. Tente novamente.');
      } finally {
        if (token === revision) controller = null;
      }
    }

    function open() {
      if (!active()) return;
      el('cityDialog')?.open && el('cityDialog').close();
      fill();
      if (!dialog.open) dialog.showModal();
      dialog.querySelector('.dialog-scroll')?.scrollTo?.(0, 0);
      compare();
    }
    openDialog = open;
    function stop() {revision++; controller?.abort(); controller = null;}
    const close = () => root.PLUVIA?.dialogs?.close(dialog) ?? dialog.close();

    el('compareOpen')?.addEventListener('click', open);
    el('compareClose').addEventListener('click', close);
    dialog.addEventListener('click', event => {if (event.target === dialog) close();});
    dialog.addEventListener('close', stop);
    select.addEventListener('change', compare);
    // Troca de cidade invalida a comparação aberta; nova previsão da cidade aberta repinta a coluna dela.
    root.addEventListener('pluvia:city-changed', () => {if (dialog.open) {stop(); dialog.close();}});
    root.addEventListener('pluvia:weather-updated', () => {if (dialog.open && !controller) compare();});
  }

  // Abre o diálogo (atalho do PWA); sem o diálogo montado não faz nada.
  return {summarize, options, mount, open:() => openDialog?.(), FRESH_MS, HORIZON};
});
