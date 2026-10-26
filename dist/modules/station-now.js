/* "Medido agora": a última leitura da estação automática do INMET mais próxima do município, pela
   função station-now (o nó WIS2 da OMM não aceita chamadas do navegador). Um pedido por cidade a cada
   10 min, com cliente próprio; a troca de cidade esconde a leitura anterior na hora e descarta respostas
   atrasadas. Leitura com mais de 2h30, futura ou sem temperatura não aparece: o cartão fica escondido
   (não vira "sem estação" nem zero). Manda só as coordenadas de referência do município, nunca GPS.
   A mesma resposta traz o boletim (METAR) do aeroporto mais próximo: sem estação do INMET (Aracaju, Boa
   Vista, Fortaleza, São Luís), o cartão mostra o aeroporto; com estação, o tempo relatado pelo aeroporto
   (chuva, trovoada, nas proximidades) entra na nota. Os dois seguem para a chuva observada do topo. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).stationNow = api;
  if (root.document && typeof module !== 'object') api.mount(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (scope) {
  'use strict';
  const ENDPOINT = 'https://dszyyrcvwrpyiypwyvxe.supabase.co/functions/v1/station-now';
  const TTL_MS = 10 * 60_000, MAX_AGE_MS = 150 * 60_000, FUTURE_MS = 15 * 60_000, CACHE_LIMIT = 12;
  const AIRPORT_MAX_AGE_MS = 75 * 60_000;

  const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
  function requestUrl(city) {
    const lat = Number(city?.lat), lon = Number(city?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const url = new URL(ENDPOINT);
    url.searchParams.set('lat', lat.toFixed(2));
    url.searchParams.set('lon', lon.toFixed(2));
    return url.href;
  }
  // Só uma leitura recente e com temperatura entra; o resto vira null.
  function reading(data, now = Date.now()) {
    const at = Date.parse(data?.time), temperature = finite(data?.temperatureC, -40, 60);
    if (!/^\d{7}$/.test(String(data?.station?.ibge || '')) || temperature === null || !Number.isFinite(at)) return null;
    if (now - at > MAX_AGE_MS || at - now > FUTURE_MS) return null;
    return {ibge:String(data.station.ibge), distanceKm:finite(data.station.distanceKm, 0, 60), at, temperature,
      humidity:finite(data.humidity, 0, 100), rainMm:finite(data.rainMm, 0, 300)};
  }
  // Boletim do aeroporto: recente (METAR horário + folga), sigla ICAO válida; temperatura pode faltar.
  function airportReading(data, now = Date.now()) {
    const airport = data?.airport, at = Date.parse(airport?.time), weather = airport?.weather;
    if (!airport || !/^[A-Z][A-Z0-9]{3}$/.test(String(airport.icao || '')) || !Number.isFinite(at) || !weather || typeof weather !== 'object') return null;
    if (now - at > AIRPORT_MAX_AGE_MS || at - now > FUTURE_MS) return null;
    const flag = key => weather[key] === true;
    const previous = airport.previous?.weather && typeof airport.previous.weather === 'object' ? airport.previous.weather : null;
    return {icao:airport.icao, distanceKm:finite(airport.distanceKm, 0, 60), at, temperature:finite(airport.temperatureC, -40, 60),
      humidity:finite(airport.humidity, 0, 100),
      weather:{rain:['light','moderate','heavy'].includes(weather.rain) ? weather.rain : null, showers:flag('showers'), drizzle:flag('drizzle'),
        thunder:flag('thunder'), nearbyShowers:flag('nearbyShowers'), nearbyThunder:flag('nearbyThunder')},
      previousWet:previous ? Boolean(previous.rain || previous.thunder || previous.drizzle) : null,
      // Visibilidade medida (metros; 10 000 com plus = "10 km ou mais"). Ausente fica null.
      visibility:finite(airport.visibility?.meters, 0, 10000) === null ? null : {meters:airport.visibility.meters, plus:airport.visibility.plus === true}};
  }
  // O que o aeroporto relata, em poucas palavras ("" quando não há chuva nem trovoada).
  function weatherPhrase(weather) {
    if (!weather) return '';
    const rain = {light:'chuva fraca', moderate:'chuva', heavy:'chuva forte'}[weather.rain];
    if (weather.thunder) return rain ? 'trovoada com chuva agora' : 'trovoada agora';
    if (rain) return `${weather.showers ? rain.replace('chuva', 'pancadas de chuva') : rain} agora`;
    if (weather.drizzle) return 'garoa agora';
    if (weather.nearbyThunder) return 'trovoada nas proximidades';
    if (weather.nearbyShowers) return 'pancadas de chuva nas proximidades';
    return '';
  }
  function describeAirport(item, {time, number} = {}) {
    const far = Number.isFinite(item.distanceKm) ? `, a ${Math.round(item.distanceKm)} km` : '';
    const parts = [`Aeroporto mais próximo (${item.icao}${far})`, `às ${time(item.at)}`];
    if (item.humidity !== null) parts.push(`umidade ${Math.round(item.humidity)}%`);
    const phrase = weatherPhrase(item.weather);
    if (phrase) parts.push(phrase);
    return {value:`${number(item.temperature, 0)}°`, note:parts.join(' · ')};
  }
  function describe(item, city, {cityName, time, number} = {}) {
    const here = item.ibge === String(city?.id);
    const place = cityName?.(item.ibge);
    const far = Number.isFinite(item.distanceKm) && item.distanceKm >= 5 ? `, a ${Math.round(item.distanceKm)} km` : '';
    const where = place ? `Estação do INMET em ${place}${here ? (far ? `${far} do centro` : '') : far}` : `Estação do INMET${far}`;
    const parts = [where, `às ${time(item.at)}`];
    if (item.humidity !== null) parts.push(`umidade ${Math.round(item.humidity)}%`);
    if (item.rainMm !== null) parts.push(item.rainMm > 0 ? `${number(item.rainMm, 1)} mm na última hora` : 'sem chuva na última hora');
    return {value:`${number(item.temperature, 1)}°`, note:parts.join(' · ')};
  }

  function mount(root) {
    const doc = root.document, el = id => doc.getElementById(id);
    const card = el('stationNow'), value = el('stationNowValue'), note = el('stationNowNote');
    // O cartão "Medido agora" saiu da Home na 1.26.4 (pedido do usuário); a leitura continua alimentando a chuva
    // observada do topo e a visibilidade do aeroporto. Com o cartão no HTML, ele volta a ser pintado.
    const ui = Boolean(card && value && note);
    const client = root.PLUVIA?.http?.createClient?.({defaultTimeoutMs:12000});
    const cache = new Map();
    let revision = 0, controller = null, pendingCity = null;
    const active = () => typeof activeCity !== 'undefined' ? activeCity : null;
    const helpers = () => {
      const time = root.PLUVIA?.time, city = active();
      return {
        cityName:id => (typeof cityById !== 'undefined' ? cityById.get(id)?.name : null) || null,
        time:at => time?.dateFormat?.('pt-BR', {hour:'2-digit', minute:'2-digit', timeZone:city?.timezone || 'America/Sao_Paulo'})?.format(at) ?? new Date(at).toISOString().slice(11, 16),
        number:(n, digits) => time?.numberFormat?.('pt-BR', {minimumFractionDigits:digits, maximumFractionDigits:digits})?.format(n) ?? n.toFixed(digits)
      };
    };
    // A leitura também alimenta a chuva observada do topo (observed-rain.js, via app.js).
    const announce = (cityId, item, airport) => root.dispatchEvent?.(new CustomEvent('pluvia:station-reading', {detail:{cityId, reading:item, airport}}));
    let shownCity = null;
    function hide() { shownCity = null; if (ui) { card.hidden = true; value.textContent = ''; note.textContent = ''; delete card.dataset.city; } announce(null, null, null); }
    function show(city, data) {
      const item = reading(data), airport = airportReading(data);
      // Sem estação: o aeroporto ocupa o cartão (se tiver temperatura); sem nenhum dos dois, nada aparece.
      if (!item && (!airport || airport.temperature === null)) { hide(); announce(String(city.id), null, airport); return; }
      announce(String(city.id), item, airport);
      shownCity = String(city.id);
      if (!ui) return;
      const text = item ? describe(item, city, helpers()) : describeAirport(airport, helpers());
      const phrase = item && airport ? weatherPhrase(airport.weather) : '';
      if (phrase) text.note += ` · aeroporto (${airport.icao}): ${phrase}`;
      const appearing = card.hidden;
      value.textContent = text.value; note.textContent = text.note;
      card.dataset.city = String(city.id);
      card.hidden = false;
      // Chega depois da previsão: desce no lugar como os outros blocos que surgem (sem empurrar de vez).
      if (appearing) root.PLUVIA?.settleBlock?.(card);
    }
    async function refresh() {
      const city = active(), url = requestUrl(city);
      if (!city || !url || !client?.getJson) { hide(); return; }
      if (shownCity && shownCity !== String(city.id)) hide();
      const stored = cache.get(city.id);
      if (stored && Date.now() - stored.at < TTL_MS) { show(city, stored.data); return; }
      // A previsão avisa mais de uma vez por carga (Open-Meteo, depois MET): um pedido por cidade de cada vez.
      if (pendingCity === city.id) return;
      pendingCity = city.id;
      const mine = ++revision;
      controller?.abort?.();
      controller = typeof AbortController === 'function' ? new AbortController() : null;
      try {
        const data = await client.getJson(url, {signal:controller?.signal, timeoutMs:12000});
        if (mine !== revision || active()?.id !== city.id) return;
        cache.set(city.id, {at:Date.now(), data});
        if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
        show(city, data);
      } catch {
        // Falha ou cancelamento: sem leitura confirmada, nada aparece (a previsão continua igual).
        if (mine === revision && active()?.id === city.id) hide();
      } finally {
        if (mine === revision) pendingCity = null;
      }
    }
    root.addEventListener?.('pluvia:city-changed', () => { revision++; pendingCity = null; controller?.abort?.(); hide(); });
    root.addEventListener?.('pluvia:weather-updated', refresh);
  }

  return {ENDPOINT, requestUrl, reading, airportReading, weatherPhrase, describe, describeAirport, mount};
});
