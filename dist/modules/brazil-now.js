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
  // Mapa: contorno do Brasil (Natural Earth 1:50m, domínio público, simplificado) numa projeção
  // equiretangular com cos(15°), a mesma usada para os pontos das capitais. Ilustrativo, não é um mapa de precisão.
  const MAP = {width:640, height:560, lon0:-74.2, lat0:5.6, scale:14, k:Math.cos(15 * Math.PI / 180)};
  const OUTLINE = 'M99 61L106 68L110 67L115 65L117 67L117 69L118 69L123 63L135 57L138 51L146 48L146 45L137 43L135 28L129 22L127 19L130 20L135 21L138 23L147 23L152 28L153 28L155 22L159 20L163 21L171 18L175 15L178 15L184 10L182 6L183 5L190 5L192 7L190 15L196 17L196 19L198 23L194 28L192 41L194 45L195 47L197 54L207 62L212 60L212 58L214 56L219 57L219 55L225 55L228 51L231 50L235 52L240 51L247 52L247 50L244 47L247 43L250 45L260 42L264 46L271 49L276 45L280 47L282 46L284 48L287 48L291 44L296 34L306 18L308 18L311 21L318 49L321 53L328 55L329 62L323 67L317 75L310 80L300 98L297 97L291 100L298 101L301 101L315 92L318 103L322 107L327 104L331 105L337 103L332 116L335 113L338 105L341 104L345 99L348 101L350 99L348 98L348 94L353 89L360 88L362 89L362 87L364 87L389 97L390 102L394 99L399 103L398 104L400 103L401 107L398 110L399 112L402 109L403 112L401 112L400 114L399 123L402 120L405 113L407 113L406 118L409 115L416 113L417 112L423 113L432 117L437 117L442 119L456 118L463 118L483 130L489 137L495 143L499 144L501 147L509 150L523 150L525 152L532 177L532 190L531 196L528 203L522 212L520 214L518 214L518 216L511 225L504 230L499 238L498 236L494 248L486 258L483 260L482 257L480 255L478 257L479 259L475 269L476 269L475 275L477 275L475 284L478 301L473 319L474 326L467 334L465 352L462 355L457 366L452 371L450 376L448 379L449 386L439 391L436 395L436 397L435 400L422 400L420 397L419 400L410 402L409 401L413 401L410 399L400 401L399 403L401 404L390 409L389 412L382 412L370 418L354 429L355 431L352 434L352 433L349 432L348 435L344 434L345 435L349 437L345 440L346 441L346 445L344 446L345 448L347 459L346 471L343 478L334 485L327 496L323 504L317 513L312 519L300 528L299 524L305 523L310 519L312 514L314 514L315 511L318 508L318 504L319 505L320 502L313 504L310 499L312 503L310 509L309 508L307 514L301 518L298 525L298 529L291 542L282 551L280 550L280 542L285 537L279 532L276 527L270 524L265 519L257 516L251 510L246 514L246 509L235 500L231 500L230 502L224 501L236 490L248 476L250 476L250 473L258 469L262 464L269 462L275 458L277 455L278 446L275 438L271 436L267 437L265 436L270 415L265 412L259 414L254 414L251 396L249 391L243 390L240 387L238 390L233 390L220 388L221 372L217 361L221 358L217 355L223 345L222 343L226 333L221 324L219 324L214 320L213 312L214 306L190 306L189 295L184 290L188 290L185 271L177 267L168 268L163 263L155 260L151 256L147 256L142 253L139 254L132 253L131 250L125 246L119 236L120 233L118 226L120 220L119 214L103 217L92 224L88 228L83 228L80 232L75 234L67 232L57 231L52 233L50 232L48 233L48 216L49 211L40 218L28 218L25 212L13 210L17 204L9 195L6 190L6 187L3 184L3 182L6 181L6 175L14 169L13 164L17 157L18 150L32 141L44 139L46 137L51 137L54 139L57 139L65 95L62 86L56 80L56 70L64 68L68 69L68 66L66 64L59 64L59 54L81 54L80 53L81 51L85 54L92 49L96 56L96 62L99 61ZM332 82L339 81L347 82L349 83L347 91L343 96L343 98L340 100L338 98L338 101L335 100L334 100L333 102L330 103L326 102L320 103L317 96L317 94L319 94L317 91L319 82L324 80L332 82ZM302 98L301 99L305 94L306 88L310 86L312 88L310 93L302 98Z';
  // Onde fica a etiqueta de cada capital (unidades do viewBox) quando o ponto real deixaria etiquetas
  // sobrepostas; o litoral do Nordeste vai para o mar, com uma linha até o ponto.
  const LABELS = {AP:[284,58], PA:[350,120], MA:[424,94], CE:[494,118], PI:[428,160], RN:[604,132], PB:[604,178], PE:[604,224],
    AL:[604,270], SE:[604,316], BA:[470,272], RO:[145,190], GO:[306,326], DF:[384,284], MG:[402,343], ES:[494,362],
    RJ:[452,414], SP:[368,404], PR:[298,442], SC:[388,474]};
  const project = (lat, lon) => [(lon - MAP.lon0) * MAP.k * MAP.scale, (MAP.lat0 - lat) * MAP.scale];
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

    const mapBox = el('brazilMap');
    function renderMap(rows) {
      if (!mapBox) return;
      const ns = 'http://www.w3.org/2000/svg', svg = doc.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', `0 0 ${MAP.width} ${MAP.height}`);
      svg.setAttribute('focusable', 'false');
      const land = doc.createElementNS(ns, 'path'); land.setAttribute('class', 'brazil-land'); land.setAttribute('d', OUTLINE);
      svg.append(land);
      const chips = [];
      for (const row of rows) {
        const [x, y] = project(row.lat, row.lon), [lx, ly] = LABELS[row.uf] || [x, y];
        if (Math.hypot(lx - x, ly - y) > 12) {
          const line = doc.createElementNS(ns, 'line'); line.setAttribute('class', 'brazil-leader');
          Object.entries({x1:x, y1:y, x2:lx, y2:ly}).forEach(([key, value]) => line.setAttribute(key, value.toFixed(1)));
          svg.append(line);
        }
        const dot = doc.createElementNS(ns, 'circle'); dot.setAttribute('class', 'brazil-dot');
        dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1)); dot.setAttribute('r', '4');
        svg.append(dot);
        const chip = doc.createElement('span'); chip.className = 'brazil-chip'; chip.dataset.cityId = row.id;
        chip.style.left = (lx / MAP.width * 100).toFixed(2) + '%'; chip.style.top = (ly / MAP.height * 100).toFixed(2) + '%';
        const color = tempColor(row.temperature);
        if (color) chip.style.setProperty('--chip', color); else chip.dataset.missing = '';
        chip.textContent = degrees(row.temperature);
        chip.title = `${row.name}/${row.uf}`;
        chips.push(chip);
      }
      mapBox.replaceChildren(svg, ...chips);
      mapBox.hidden = false;
    }

    function render(rows) {
      renderMap(rows);
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
      list.replaceChildren(); if (mapBox) {mapBox.hidden = true; mapBox.replaceChildren();} status('Consultando as 27 capitais…');
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
    const pick = event => {
      const button = event.target.closest?.('[data-city-id]');
      if (!button) return;
      // Fecha na hora (invalidação de cidade é imediata) e abre pelo fluxo normal da Home.
      dialog.close();
      if (typeof chooseCity === 'function') chooseCity(button.dataset.cityId);
    };
    list.addEventListener('click', pick);
    // O mapa é um atalho visual por toque (aria-hidden); a lista abaixo é o caminho acessível.
    mapBox?.addEventListener('click', pick);
  }

  return {buildUrl, parse, group, REGIONS, tempColor, project, LABELS, MAP, mount, open:() => openDialog?.()};
});
