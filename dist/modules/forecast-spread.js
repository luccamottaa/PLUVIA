(function (root, factory) {
  const common = typeof module === 'object' && module.exports;
  const api = factory(root);
  if (common) module.exports = api;
  (root.PLUVIA = root.PLUVIA || {}).forecastSpread = api;
  if (root.document) api.mount(root);
})(globalThis, function (root) {
  'use strict';
  // Faixa provável dos extremos diários entre os membros do conjunto ICON EPS.
  // Só consulta quando o detalhe diário é aberto; a Home não ganha requests.
  const MIN_MEMBERS = 20;
  const FRESH_MS = 3 * 3600000;
  const FAILURE_MS = 5 * 60000;
  const MAX_CITIES = 8;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const round = value => Math.round(value * 10) / 10;

  function quantile(sorted, q) {
    const position = (sorted.length - 1) * q, low = Math.floor(position), high = Math.ceil(position);
    return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
  }

  function memberSeries(daily, variable) {
    const pattern = new RegExp(`^${variable}(?:_member\\d+)?$`);
    return Object.entries(daily || {}).filter(([key, values]) => pattern.test(key) && Array.isArray(values)).map(([, values]) => values);
  }

  // Percentis 10–90 por dia; membros ausentes não viram zero e dias com poucos membros ficam sem faixa.
  function summarize(response) {
    const daily = response?.daily, times = daily?.time;
    if (!Array.isArray(times)) return null;
    const series = {max: memberSeries(daily, 'temperature_2m_max'), min: memberSeries(daily, 'temperature_2m_min')};
    const days = {};
    times.forEach((date, index) => {
      if (!DATE.test(String(date))) return;
      const range = list => {
        const values = list.map(values => values[index]).filter(value => typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 70).sort((a, b) => a - b);
        return values.length >= MIN_MEMBERS ? {low: round(quantile(values, .1)), high: round(quantile(values, .9)), members: values.length} : null;
      };
      const entry = {max: range(series.max), min: range(series.min)};
      if (entry.max || entry.min) days[date] = entry;
    });
    return Object.keys(days).length ? {days, members: Math.max(series.max.length, series.min.length)} : null;
  }

  function describe(day) {
    if (!day) return '';
    const span = range => Math.round(range.low) === Math.round(range.high) ? `${Math.round(range.low)}°` : `${Math.round(range.low)}° a ${Math.round(range.high)}°`;
    const parts = [day.max && `máxima ${span(day.max)}`, day.min && `mínima ${span(day.min)}`].filter(Boolean);
    return parts.length ? `Faixa provável entre os cenários do conjunto ICON: ${parts.join(', ')}.` : '';
  }

  function mount(root) {
    const app = root.PLUVIA;
    const client = app?.http?.createClient?.({defaultTimeoutMs: 12000});
    const services = client && app?.services?.createServices?.({client});
    const entries = new Map();
    let revision = 0;

    function remember(cityId, entry) {
      entries.delete(cityId);
      entries.set(cityId, entry);
      while (entries.size > MAX_CITIES) entries.delete(entries.keys().next().value);
    }
    function fresh(entry, now) {
      return entry && !entry.promise && now - entry.at < (entry.value ? FRESH_MS : FAILURE_MS);
    }
    function load(city, now = Date.now()) {
      if (!services?.ensemble?.getDaily || !city?.id) return Promise.resolve(null);
      const current = entries.get(city.id);
      if (current?.promise) return current.promise;
      if (fresh(current, now)) return Promise.resolve(current.value);
      const started = revision;
      const promise = services.ensemble.getDaily(city).then(response => {
        if (started !== revision) return null;
        const value = summarize(response);
        remember(city.id, {at: Date.now(), value});
        root.dispatchEvent?.(new CustomEvent('pluvia:forecast-spread', {detail: {cityId: city.id}}));
        return value;
      }, error => {
        if (started !== revision || error?.code === 'cancelled') { entries.delete(city.id); return null; }
        remember(city.id, {at: Date.now(), value: null});
        return null;
      });
      remember(city.id, {at: now, value: current?.value || null, promise});
      return promise;
    }
    function peek(cityId, now = Date.now()) {
      const entry = entries.get(cityId);
      return entry?.value && now - entry.at < FRESH_MS ? entry.value : null;
    }
    // Scripts clássicos compartilham a declaração lexical `activeCity` de app.js.
    const currentCity = () => typeof activeCity !== 'undefined' ? activeCity : null;
    root.document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-day-index]');
      if (!button || !button.closest('#forecastList')) return;
      load(currentCity());
    });
    root.addEventListener('pluvia:city-changed', () => {
      revision += 1;
      client?.abortAll?.();
      for (const [cityId, entry] of entries) if (entry.promise) entries.delete(cityId);
    });
    Object.assign(app.forecastSpread, {load, peek});
  }

  return {summarize, describe, quantile, mount, MIN_MEMBERS};
});
