/* "Medido agora": a última leitura da estação automática do INMET mais próxima do município, pela
   função station-now (o nó WIS2 da OMM não aceita chamadas do navegador). Um pedido por cidade a cada
   10 min, com cliente próprio; a troca de cidade esconde a leitura anterior na hora e descarta respostas
   atrasadas. Leitura com mais de 2h30, futura ou sem temperatura não aparece: o cartão fica escondido
   (não vira "sem estação" nem zero). Manda só as coordenadas de referência do município, nunca GPS. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).stationNow = api;
  if (root.document && typeof module !== 'object') api.mount(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (scope) {
  'use strict';
  const ENDPOINT = 'https://dszyyrcvwrpyiypwyvxe.supabase.co/functions/v1/station-now';
  const TTL_MS = 10 * 60_000, MAX_AGE_MS = 150 * 60_000, FUTURE_MS = 15 * 60_000, CACHE_LIMIT = 12;

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
    if (!card || !value || !note) return;
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
    function hide() { card.hidden = true; value.textContent = ''; note.textContent = ''; delete card.dataset.city; }
    function show(city, data) {
      const item = reading(data);
      if (!item) { hide(); return; }
      const text = describe(item, city, helpers());
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
      if (card.dataset.city && card.dataset.city !== String(city.id)) hide();
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

  return {ENDPOINT, requestUrl, reading, describe, mount};
});
