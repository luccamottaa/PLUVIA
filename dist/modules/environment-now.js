/* Nível do rio (ANA) e focos de calor (INPE) perto da cidade aberta, pedido do usuário em outubro/2026.
   O cron do servidor (environment-refresh) baixa as fontes públicas de hora em hora; aqui só se lê o
   resumo da cidade pelo RPC pluvia_city_environment (chave publicável), com o código IBGE e as
   coordenadas de referência do município, nunca GPS. Um pedido por cidade a cada 30 min, cliente próprio;
   a troca de cidade esconde as leituras na hora e descarta respostas atrasadas. Rio só nas cidades com
   estação da ANA na própria cidade; focos só quando há algum (ausência de foco detectado não vira "sem
   fogo": nuvem esconde foco do satélite). Focos de calor não são atribuídos à qualidade do ar. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).environmentNow = api;
  if (root.document && typeof module !== 'object') api.mount(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (scope) {
  'use strict';
  const PROJECT = 'https://dszyyrcvwrpyiypwyvxe.supabase.co';
  const KEY = 'sb_publishable_SdPTXhk3Q7aD-ra0S9dm_A_rnXSS4Jc';
  const TTL_MS = 30 * 60_000, CACHE_LIMIT = 12, RIVER_MAX_AGE_MS = 12 * 3600_000, FIRES_MAX_AGE_MS = 6 * 3600_000, FUTURE_MS = 15 * 60_000;

  const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
  function requestUrl(city) {
    const lat = Number(city?.lat), lon = Number(city?.lon);
    if (!/^\d{7}$/.test(String(city?.id || '')) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return `${PROJECT}/rest/v1/rpc/pluvia_city_environment?p_city=${city.id}&p_lat=${lat.toFixed(3)}&p_lon=${lon.toFixed(3)}`;
  }
  // Só leitura recente e com cota válida; variação ausente fica null (nunca "estável" por falta de dado).
  function river(data, now = Date.now()) {
    const item = data?.river, at = Date.parse(item?.at), level = finite(item?.levelCm, -1000, 6000);
    if (!item || level === null || !Number.isFinite(at) || now - at > RIVER_MAX_AGE_MS || at - now > FUTURE_MS) return null;
    if (typeof item.river !== 'string' || typeof item.place !== 'string' || !item.river || !item.place) return null;
    return {river:item.river.slice(0, 40), place:item.place.slice(0, 60), at, levelCm:level, changeCm:finite(item.change24hCm, -500, 500)};
  }
  function fires(data, now = Date.now()) {
    const item = data?.fires, at = Date.parse(item?.updatedAt), count = item?.count;
    if (!item || !Number.isInteger(count) || count < 1 || count > 100_000 || !Number.isFinite(at) || now - at > FIRES_MAX_AGE_MS) return null;
    return {count, nearestKm:finite(item.nearestKm, 0, 60), radiusKm:finite(item.radiusKm, 1, 200) ?? 50};
  }
  function describeRiver(item, {time, number} = {}) {
    const parts = [`${item.river} em ${item.place}`];
    if (item.changeCm !== null) {
      const size = Math.abs(item.changeCm);
      parts.push(size <= 1 ? 'estável em 24 h' : `${item.changeCm > 0 ? 'subindo' : 'descendo'} ${size} cm em 24 h`);
    }
    parts.push(`ANA, às ${time(item.at)}`);
    return {value:`${number(item.levelCm / 100, 2)} m`, note:parts.join(' · ')};
  }
  function describeFires(item) {
    const parts = [`${item.count === 1 ? 'Detectado' : 'Detectados'} a até ${Math.round(item.radiusKm)} km nas últimas 24 h`];
    if (item.nearestKm !== null) parts.push(`o mais perto a ${Math.max(1, Math.round(item.nearestKm))} km`);
    parts.push('satélites do INPE');
    return {value:String(item.count), note:parts.join(' · ')};
  }

  function mount(root) {
    const doc = root.document, el = id => doc.getElementById(id);
    const cards = {river:[el('riverLevel'), el('riverLevelValue'), el('riverLevelNote')], fires:[el('fireSpots'), el('fireSpotsValue'), el('fireSpotsNote')]};
    if (Object.values(cards).some(list => list.some(node => !node))) return;
    const client = root.PLUVIA?.http?.createClient?.({defaultTimeoutMs:10000});
    const cache = new Map();
    let revision = 0, controller = null, pendingCity = null;
    const active = () => typeof activeCity !== 'undefined' ? activeCity : null;
    const helpers = () => {
      const time = root.PLUVIA?.time, city = active();
      return {
        time:at => time?.dateFormat?.('pt-BR', {hour:'2-digit', minute:'2-digit', timeZone:city?.timezone || 'America/Sao_Paulo'})?.format(at) ?? new Date(at).toISOString().slice(11, 16),
        number:(n, digits) => time?.numberFormat?.('pt-BR', {minimumFractionDigits:digits, maximumFractionDigits:digits})?.format(n) ?? n.toFixed(digits)
      };
    };
    function paint(kind, text) {
      const [card, value, note] = cards[kind];
      if (!text) { card.hidden = true; value.textContent = ''; note.textContent = ''; return; }
      const appearing = card.hidden;
      value.textContent = text.value; note.textContent = text.note;
      card.hidden = false;
      // Chega depois da previsão: desce no lugar como os outros blocos que surgem.
      if (appearing) root.PLUVIA?.settleBlock?.(card);
    }
    function hide() { paint('river', null); paint('fires', null); }
    function show(data) {
      const water = river(data), fire = fires(data);
      paint('river', water && describeRiver(water, helpers()));
      paint('fires', fire && describeFires(fire));
    }
    async function refresh() {
      const city = active(), url = requestUrl(city);
      if (!city || !url || !client?.getJson) { hide(); return; }
      const stored = cache.get(city.id);
      if (stored && Date.now() - stored.at < TTL_MS) { show(stored.data); return; }
      if (pendingCity === city.id) return;
      pendingCity = city.id;
      const mine = ++revision;
      controller?.abort?.();
      controller = typeof AbortController === 'function' ? new AbortController() : null;
      try {
        const data = await client.getJson(url, {signal:controller?.signal, timeoutMs:10000, cache:'no-store', headers:{apikey:KEY, Authorization:`Bearer ${KEY}`}});
        if (mine !== revision || active()?.id !== city.id) return;
        cache.set(city.id, {at:Date.now(), data});
        if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
        show(data);
      } catch {
        // Falha ou cancelamento: nada aparece (nunca "sem focos" ou cota inventada).
        if (mine === revision && active()?.id === city.id) hide();
      } finally {
        if (mine === revision) pendingCity = null;
      }
    }
    root.addEventListener?.('pluvia:city-changed', () => { revision++; pendingCity = null; controller?.abort?.(); hide(); });
    root.addEventListener?.('pluvia:weather-updated', refresh);
  }

  return {requestUrl, river, fires, describeRiver, describeFires, mount};
});
