/* Resumo de cada cartão de "Minha conta" (o valor ao lado do título, como nos Ajustes do iPhone): quantos
   tipos de aviso estão ligados, horários dos resumos, nível e silêncio, cidades e aparelhos. Lê só o
   formulário e as listas já desenhadas por notifications.js; não guarda nada nem faz consultas. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).accountSummary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TYPE_FIELDS = ['official_alerts', 'rain_approaching', 'heavy_rain', 'storms', 'strong_wind', 'extreme_heat', 'air_quality', 'weather_changes'];
  const SEVERITY = {1:'Todos os níveis', 2:'A partir de atenção', 3:'A partir de perigo', 4:'Só severidade máxima'};
  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  const time = value => /^\d{2}:\d{2}/.test(String(value || '')) ? String(value).slice(0, 5) : '';

  function texts(state) {
    const on = TYPE_FIELDS.filter(field => state.types?.[field]).length;
    const types = on === TYPE_FIELDS.length ? 'Todos' : on === 0 ? 'Nenhum' : `${on} de ${TYPE_FIELDS.length}`;
    const parts = [];
    if (state.daily) parts.push(`Manhã${time(state.dailyTime) ? ' ' + time(state.dailyTime) : ''}`);
    if (state.evening) parts.push(`Noite${time(state.eveningTime) ? ' ' + time(state.eveningTime) : ''}`);
    const summaries = parts.length ? parts.join(' · ') : 'Desligados';
    const quiet = state.quiet && time(state.quietStart) && time(state.quietEnd) ? ` · silêncio ${time(state.quietStart)}–${time(state.quietEnd)}` : '';
    const timing = (SEVERITY[state.severity] || SEVERITY[1]) + quiet;
    const cities = state.citiesChecked ? plural(state.citiesChecked, 'marcada', 'marcadas') : state.citiesAvailable ? plural(state.citiesAvailable, 'disponível', 'disponíveis') : 'Nenhuma nova';
    const locations = state.locations ? plural(state.locations, 'cidade', 'cidades') : 'Nenhuma';
    const devices = state.devices ? `${plural(state.activeDevices, 'ativo', 'ativos')} de ${state.devices}` : 'Nenhum';
    return {types, summaries, timing, cities, locations, devices};
  }

  function read(form, doc) {
    const field = name => form?.elements?.namedItem?.(name);
    const choices = [...(doc.getElementById('notificationCitiesGroup')?.querySelectorAll?.('input[type=checkbox]') || [])].filter(input => !input.disabled);
    const devices = [...(doc.querySelectorAll?.('#notificationDevices .notification-device') || [])];
    return {
      types:Object.fromEntries(TYPE_FIELDS.map(name => [name, Boolean(field(name)?.checked)])),
      daily:Boolean(field('daily_summary')?.checked), dailyTime:field('daily_summary_time')?.value,
      evening:Boolean(field('evening_summary')?.checked), eveningTime:field('evening_summary_time')?.value,
      severity:Number(field('minimum_severity')?.value) || 1,
      quiet:Boolean(field('quiet_enabled')?.checked), quietStart:field('quiet_start')?.value, quietEnd:field('quiet_end')?.value,
      citiesChecked:choices.filter(input => input.checked).length, citiesAvailable:choices.length,
      locations:doc.querySelectorAll?.('#notificationLocations .notification-location-row')?.length || 0,
      devices:devices.length, activeDevices:devices.filter(row => row.dataset?.enabled === 'true').length
    };
  }

  function paint(form, doc = globalThis.document) {
    if (!form || !doc) return;
    const values = texts(read(form, doc));
    for (const [key, text] of Object.entries(values)) {
      const node = doc.querySelector?.(`[data-account-summary="${key}"]`);
      if (node && node.textContent !== text) node.textContent = text;
    }
  }

  return {TYPE_FIELDS, texts, read, paint};
});
