/* Brasil agora: as 27 capitais em uma única consulta Open-Meteo de várias coordenadas, só ao abrir
   o diálogo (nunca na abertura da Home), com cliente próprio, cache curto em memória e revisão para
   descartar respostas atrasadas. Tocar numa capital abre a cidade pelo fluxo normal (chooseCity).
   Valores ausentes ficam "—"; nada vira zero. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).brazilNow = api;
  if (root.document) api.mount(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
  const FRESH_MS = 20 * 60 * 1000;
  const REGIONS = [
    ['Norte', ['AC','AM','AP','PA','RO','RR','TO']],
    ['Nordeste', ['AL','BA','CE','MA','PB','PE','PI','RN','SE']],
    ['Centro-Oeste', ['DF','GO','MS','MT']],
    ['Sudeste', ['ES','MG','RJ','SP']],
    ['Sul', ['PR','RS','SC']]
  ];
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

  // Uma URL para todas: coordenadas e fusos na mesma ordem das capitais (timezone por local,
  // então máxima/mínima do dia seguem o calendário de cada capital).
  function buildUrl(cities) {
    const url = new URL(ENDPOINT);
    url.searchParams.set('latitude', cities.map(city => city.lat).join(','));
    url.searchParams.set('longitude', cities.map(city => city.lon).join(','));
    url.searchParams.set('timezone', cities.map(city => city.timezone).join(','));
    url.searchParams.set('current', 'temperature_2m,weather_code,is_day');
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min');
    url.searchParams.set('forecast_days', '1');
    return url.href;
  }

  // Resposta em lista, na ordem pedida. Cada capital é validada sozinha: uma leitura ruim vira
  // "indisponível" naquela linha, sem derrubar as demais.
  function parse(response, cities) {
    const list = Array.isArray(response) ? response : cities.length === 1 && response && typeof response === 'object' ? [response] : null;
    if (!list || list.length !== cities.length) throw Object.assign(new Error('Resposta das capitais incompleta.'), {code:'invalid_response'});
    return cities.map((city, index) => {
      const item = list[index], current = item?.current;
      const temperature = finite(current?.temperature_2m);
      const code = finite(current?.weather_code);
      return {
        id:city.id, name:city.name, uf:city.uf,
        temperature:temperature !== null && temperature > -60 && temperature < 60 ? temperature : null,
        code:code !== null && code >= 0 && code <= 99 ? code : null,
        isDay:current?.is_day !== 0,
        high:finite(item?.daily?.temperature_2m_max?.[0]),
        low:finite(item?.daily?.temperature_2m_min?.[0])
      };
    });
  }

  function group(rows) {
    return REGIONS.map(([name, ufs]) => ({name, rows:rows.filter(row => ufs.includes(row.uf)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))}))
      .filter(region => region.rows.length);
  }

  let openDialog = null;
  function mount(root) {
    const doc = root.document, el = id => doc.getElementById(id);
    const dialog = el('brazilDialog'), list = el('brazilList');
    if (!dialog || !list) return;
    const client = root.PLUVIA?.http?.createClient?.({defaultTimeoutMs:12000});
    let revision = 0, cache = null;
    const status = text => {el('brazilStatus').textContent = text;};
    const capitals = () => typeof CAPITALS !== 'undefined' ? CAPITALS : [];
    const degrees = value => value === null ? '—' : Math.round(value) + '°';

    function render(rows) {
      const icons = root.PLUVIA?.weatherIcons;
      list.replaceChildren(...group(rows).map(region => {
        const section = doc.createElement('section'), title = doc.createElement('h3'), items = doc.createElement('ul');
        title.textContent = region.name;
        items.append(...region.rows.map(row => {
          const li = doc.createElement('li'), button = doc.createElement('button');
          button.type = 'button'; button.className = 'brazil-row'; button.dataset.cityId = row.id;
          const label = row.code === null ? 'Condição indisponível' : icons?.condition?.(row.code, row.isDay)?.label || 'Condição prevista';
          const icon = doc.createElement('span'); icon.className = 'brazil-icon';
          if (row.code !== null && icons?.markup) icon.innerHTML = icons.markup(row.code, row.isDay, {className:'brazil-weather-icon', decorative:true});
          const name = doc.createElement('span'); name.className = 'brazil-name'; name.textContent = `${row.name}/${row.uf}`;
          const temp = doc.createElement('strong'); temp.className = 'brazil-temp'; temp.textContent = degrees(row.temperature);
          const range = doc.createElement('small'); range.className = 'brazil-range';
          range.textContent = row.high === null || row.low === null ? '—' : `${degrees(row.high)}/${degrees(row.low)}`;
          button.setAttribute('aria-label', `${row.name}/${row.uf}: ${row.temperature === null ? 'temperatura indisponível' : Math.round(row.temperature) + ' graus'}, ${label}${row.high === null || row.low === null ? '' : `, máxima ${Math.round(row.high)} e mínima ${Math.round(row.low)}`}. Abrir cidade`);
          button.append(icon, name, temp, range);
          li.append(button);
          return li;
        }));
        section.append(title, items);
        return section;
      }));
    }

    async function load() {
      const token = ++revision, cities = capitals();
      if (cache && Date.now() - cache.at < FRESH_MS) {render(cache.rows); status(`Atualizado às ${clock(cache.at)} · Open-Meteo`); return;}
      list.replaceChildren(); status('Consultando as 27 capitais…');
      try {
        if (!client?.getJson || !cities.length) throw new Error('Cliente indisponível.');
        client.abortAll?.();
        const data = await client.getJson(buildUrl(cities), {timeoutMs:12000, cache:'no-store'});
        if (token !== revision) return;
        const rows = parse(data, cities);
        cache = {rows, at:Date.now()};
        render(rows); status(`Atualizado às ${clock(cache.at)} · Open-Meteo`);
      } catch (error) {
        if (token !== revision || error?.code === 'cancelled') return;
        status(root.navigator?.onLine === false ? 'Sem internet: não foi possível consultar as capitais.' : 'Não foi possível consultar as capitais agora. Tente novamente.');
      }
    }
    const clock = at => new Intl.DateTimeFormat('pt-BR', {hour:'2-digit', minute:'2-digit'}).format(at);

    function open() {
      el('cityDialog')?.open && el('cityDialog').close();
      if (!dialog.open) dialog.showModal();
      dialog.querySelector('.dialog-scroll')?.scrollTo?.(0, 0);
      load();
    }
    openDialog = open;
    const close = () => root.PLUVIA?.dialogs?.close(dialog) ?? dialog.close();
    el('brazilOpen')?.addEventListener('click', open);
    el('brazilClose').addEventListener('click', close);
    dialog.addEventListener('click', event => {if (event.target === dialog) close();});
    dialog.addEventListener('close', () => {revision++; client?.abortAll?.();});
    list.addEventListener('click', event => {
      const button = event.target.closest?.('[data-city-id]');
      if (!button) return;
      // Fecha na hora (invalidação de cidade é imediata) e abre pelo fluxo normal da Home.
      dialog.close();
      if (typeof chooseCity === 'function') chooseCity(button.dataset.cityId);
    });
  }

  return {buildUrl, parse, group, REGIONS, mount, open:() => openDialog?.()};
});
