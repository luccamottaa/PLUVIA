/* Brasil agora: as 27 capitais em uma única consulta Open-Meteo de várias coordenadas, só ao abrir
   o diálogo (nunca na abertura da Home), com cliente próprio, cache curto em memória e revisão para
   descartar respostas atrasadas. Tocar numa capital (na lista ou no mapa) abre a cidade pelo fluxo normal (chooseCity).
   Valores ausentes ficam "—"; nada vira zero. O mapa (contorno, projeção e etiquetas) mora em brazil-map.js e
   brazil-outline.js, baixados só ao abrir; mapa e lista são desenhados a partir das mesmas linhas. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).brazilNow = api;
  if (root.document) api.mount(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
  const FRESH_MS = 20 * 60 * 1000;
  // Mapa (contorno + projeção + etiquetas): baixado só ao abrir o diálogo; sem ele a lista continua funcionando.
  const MAP_SCRIPTS = ['/modules/brazil-outline.js?v=outline-1', '/modules/brazil-map.js?v=map-1'];
  // O horário do "Atualizado às" é sempre o de Brasília, dito na própria frase: as capitais estão em quatro fusos.
  const STATUS_ZONE = 'America/Sao_Paulo';
  const REGIONS = [
    ['Norte', ['AC','AM','AP','PA','RO','RR','TO']],
    ['Nordeste', ['AL','BA','CE','MA','PB','PE','PI','RN','SE']],
    ['Centro-Oeste', ['DF','GO','MS','MT']],
    ['Sudeste', ['ES','MG','RJ','SP']],
    ['Sul', ['PR','RS','SC']]
  ];
  // Escala de temperatura própria do mapa (não reutiliza o azul da marca): frio azul → calor vermelho.
  const STOPS = [[5,[91,140,255]],[15,[76,195,230]],[22,[95,211,141]],[27,[242,208,75]],[32,[243,154,61]],[37,[229,83,61]]];
  function tempColor(value) {
    if (value === null || !Number.isFinite(value)) return null;
    if (value <= STOPS[0][0]) return `rgb(${STOPS[0][1]})`;
    for (let i = 1; i < STOPS.length; i++) {
      const [t1, c1] = STOPS[i], [t0, c0] = STOPS[i - 1];
      if (value <= t1) {const f = (value - t0) / (t1 - t0); return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * f)).join(',')})`;}
    }
    return `rgb(${STOPS.at(-1)[1]})`;
  }
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const rgbOf = value => {const color = tempColor(value); return color ? color.slice(4, -1).split(',').map(Number) : null;};

  // Cidades do interior que só entram no campo de cores (sem etiqueta): entre as capitais sobra muito território,
  // e o campo interpolado só com elas pintava a Amazônia e o Cerrado com a temperatura do litoral.
  const FIELD_POINTS = [[-0.13,-67.09],[-3.35,-64.71],[-7.26,-64.8],[-7.63,-72.67],[-4.27,-55.98],[-3.2,-52.21],[-5.37,-49.12],
    [-7.19,-48.21],[-5.52,-47.47],[-6.77,-43.02],[-7.21,-39.32],[-9.39,-40.5],[-12.15,-45],[-14.86,-40.84],[-16.73,-43.86],
    [-18.92,-48.28],[-16.47,-54.64],[-11.86,-55.51],[-12.74,-60.15],[-15.89,-52.26],[-22.22,-54.81],[-22.12,-51.39],
    [-24.96,-53.46],[-27.1,-52.62],[-29.68,-53.81],[-29.75,-57.09],[-10.18,-48.88],[-1.72,-55.87]]
    .map(([lat, lon]) => ({lat, lon, timezone:'auto'}));

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
        id:city.id, name:city.name, uf:city.uf, lat:city.lat, lon:city.lon,
        temperature:temperature !== null && temperature > -60 && temperature < 60 ? temperature : null,
        code:code !== null && code >= 0 && code <= 99 ? code : null,
        isDay:current?.is_day !== 0,
        high:finite(item?.daily?.temperature_2m_max?.[0]),
        low:finite(item?.daily?.temperature_2m_min?.[0])
      };
    });
  }

  // A resposta traz as capitais e depois os pontos do interior. Uma lista sem os pontos extras ainda serve
  // (só as capitais pintam o campo); tamanho diferente disso é resposta incompleta.
  function split(response, cities) {
    const list = Array.isArray(response) ? response : null;
    if (list && list.length === cities.length + FIELD_POINTS.length) {
      return {rows:parse(list.slice(0, cities.length), cities), extra:list.slice(cities.length).map((item, index) => {
        const temperature = finite(item?.current?.temperature_2m);
        return {...FIELD_POINTS[index], temperature:temperature !== null && temperature > -60 && temperature < 60 ? temperature : null};
      })};
    }
    return {rows:parse(response, cities), extra:[]};
  }

  function group(rows) {
    return REGIONS.map(([name, ufs]) => ({name, rows:rows.filter(row => ufs.includes(row.uf)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))}))
      .filter(region => region.rows.length);
  }

  const degrees = value => value === null ? '—' : Math.round(value) + '°';

  // Capitais sem leitura (falha da consulta): mesmas linhas, tudo "—". Nada é pulado nem inventado.
  function emptyRows(cities) {
    return cities.map(city => ({id:city.id, name:city.name, uf:city.uf, lat:city.lat, lon:city.lon, temperature:null, code:null, isDay:true, high:null, low:null}));
  }

  // Pinos do mapa a partir das MESMAS linhas da lista: norte → sul (ordem do Tab), texto, cor e nome acessível.
  function pins(rows) {
    return rows.slice().sort((a, b) => b.lat - a.lat || a.lon - b.lon).map(row => ({
      id:row.id, lat:row.lat, lon:row.lon, text:degrees(row.temperature), color:tempColor(row.temperature),
      label:`${row.name}/${row.uf}: ${row.temperature === null ? 'temperatura indisponível' : Math.round(row.temperature) + ' graus'}. Abrir cidade`
    }));
  }

  function statusText(at, format) {
    return `Atualizado às ${format(at)} (horário de Brasília) · Open-Meteo`;
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

    const mapBox = el('brazilMap'), legend = el('brazilLegend');
    let fieldRows = [];
    // Pinta o campo numa tela pequena e devolve a imagem; sem canvas, o mapa fica só com as etiquetas.
    function paintField(grid) {
      const canvas = grid && doc.createElement('canvas'), ctx = canvas?.getContext?.('2d');
      if (!ctx) return null;
      canvas.width = grid.width; canvas.height = grid.height;
      const image = ctx.createImageData(grid.width, grid.height);
      grid.values.forEach((value, index) => {const [r, g, b] = rgbOf(value); image.data.set([r, g, b, 255], index * 4);});
      ctx.putImageData(image, 0, 0);
      try {return canvas.toDataURL('image/png');} catch {return null;}
    }
    // Contorno e projeção sob demanda (uma vez por visita); falha não derruba a lista e tenta de novo na próxima abertura.
    let mapModules = null;
    function loadMapModules() {
      if (root.PLUVIA?.brazilMap && root.PLUVIA?.brazilOutline) return Promise.resolve(true);
      mapModules ||= Promise.all(MAP_SCRIPTS.map(src => new Promise((resolve, reject) => {
        const script = doc.createElement('script');
        script.src = src; script.async = false;
        script.onload = resolve; script.onerror = () => reject(new Error('Mapa indisponível'));
        doc.head.appendChild(script);
      }))).then(() => Boolean(root.PLUVIA?.brazilMap && root.PLUVIA?.brazilOutline), () => {mapModules = null; return false;});
      return mapModules;
    }
    async function drawMap(rows, token) {
      if (!mapBox) return;
      const ready = await loadMapModules();
      if (token !== revision) return;
      if (!ready) {mapBox.hidden = true; if (legend) legend.hidden = true; return;}
      mapBox.hidden = false;
      const {brazilMap, brazilOutline} = root.PLUVIA;
      const heat = paintField(brazilMap.field(rows.concat(fieldRows), brazilMap.projectionFor(brazilOutline)));
      brazilMap.draw(mapBox, {doc, outline:brazilOutline, pins:pins(rows), heatHref:heat, root});
      if (legend) legend.hidden = !heat;
    }

    function render(rows, token = revision) {
      drawMap(rows, token);
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
      if (cache && Date.now() - cache.at < FRESH_MS) {fieldRows = cache.fieldRows; render(cache.rows, token); status(statusText(cache.at, clock)); return;}
      list.replaceChildren(); if (mapBox) mapBox.hidden = true; if (legend) legend.hidden = true; status('Consultando as 27 capitais…');
      try {
        if (!client?.getJson || !cities.length) throw new Error('Cliente indisponível.');
        client.abortAll?.();
        const data = await client.getJson(buildUrl(cities.concat(FIELD_POINTS)), {timeoutMs:12000, cache:'no-store'});
        if (token !== revision) return;
        const {rows, extra} = split(data, cities);
        fieldRows = extra;
        cache = {rows, fieldRows, at:Date.now()};
        render(rows, token); status(statusText(cache.at, clock));
      } catch (error) {
        if (token !== revision || error?.code === 'cancelled') return;
        // Mapa e lista continuam com as 27 capitais, todas "—" (tocar ainda abre a cidade); a frase diz o que houve.
        fieldRows = [];
        render(emptyRows(cities), token);
        status(root.navigator?.onLine === false ? 'Sem internet: não foi possível consultar as capitais.' : 'Não foi possível consultar as capitais agora. Tente novamente.');
      }
    }
    // Sempre horário de Brasília (dito no texto): antes usava o fuso da cidade aberta sem dizer qual.
    const clock = at => {
      const options = {hour:'2-digit', minute:'2-digit', timeZone:STATUS_ZONE};
      return (root.PLUVIA?.time?.dateFormat?.('pt-BR', options) || new Intl.DateTimeFormat('pt-BR', options)).format(at);
    };

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
    const pick = event => {
      const button = event.target.closest?.('[data-city-id]');
      if (!button) return;
      // Fecha na hora (invalidação de cidade é imediata) e abre pelo fluxo normal da Home.
      dialog.close();
      if (typeof chooseCity === 'function') chooseCity(button.dataset.cityId);
    };
    list.addEventListener('click', pick);
    // Cada temperatura do mapa é um botão (toque, Enter ou Espaço) e abre a cidade igual à linha da lista.
    mapBox?.addEventListener('click', pick);
  }

  return {buildUrl, parse, split, FIELD_POINTS, group, REGIONS, tempColor, MAP_SCRIPTS, STATUS_ZONE, emptyRows, pins, statusText, mount,
    open:() => openDialog?.()};
});
