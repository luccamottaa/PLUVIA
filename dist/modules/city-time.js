/* Instantes e calendários municipais: nunca usar o fuso implícito do navegador. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.time = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const formatters = new Map(), instants = new Map(), intl = new Map();
  const ISO = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?$/i;
  function remember(map, key, value, limit) {
    map.set(key,value);
    if (map.size > limit) map.delete(map.keys().next().value);
    return value;
  }
  function wallTime(value) {
    const match = typeof value === 'string' && value.match(ISO);
    if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] || 0) > 59) return NaN;
    const text = value.slice(0,value.length - (match[6]?.length || 0));
    const at = Date.parse(text + 'Z');
    // Date.parse normaliza 30/02 em algumas engines; uma data inválida não é medição.
    return Number.isFinite(at) && new Date(at).toISOString().slice(0,10) === match[1] ? at : NaN;
  }
  function formatter(timezone) {
    if (!formatters.has(timezone)) remember(formatters,timezone,new Intl.DateTimeFormat('en-CA',{
      timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
    }),32);
    return formatters.get(timezone);
  }
  // Criar um Intl.*Format custa caro (≈1 ms cada num celular): trocar de cidade montava dezenas.
  // Os formatadores ficam guardados por idioma + opções, num cache limitado.
  function cachedFormat(kind, locale, options) {
    const key = kind + locale + JSON.stringify(options || {});
    const known = intl.get(key);
    if (known) return known;
    return remember(intl,key,kind === 'n' ? new Intl.NumberFormat(locale,options) : new Intl.DateTimeFormat(locale,options),96);
  }
  const dateFormat = (locale, options) => cachedFormat('d',locale,options);
  const numberFormat = (locale, options) => cachedFormat('n',locale,options);
  function localParts(at, timezone) {
    const parts = formatter(timezone).formatToParts(new Date(at));
    const value = type => parts.find(part => part.type === type).value;
    return {day:`${value('year')}-${value('month')}-${value('day')}`,hour:Number(value('hour')),minute:Number(value('minute')),second:Number(value('second'))};
  }
  function parse(value, city) {
    const wall = wallTime(value);
    if (!Number.isFinite(wall)) return NaN;
    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return Date.parse(value);
    const timezone = typeof city === 'string' ? city : city?.timezone;
    if (!timezone) return NaN;
    const key = timezone + ':' + value;
    if (instants.has(key)) return instants.get(key);
    try {
      let at = wall;
      for (let i = 0; i < 4; i++) {
        const parts = localParts(at,timezone);
        const local = Date.parse(`${parts.day}T${String(parts.hour).padStart(2,'0')}:${String(parts.minute).padStart(2,'0')}:${String(parts.second).padStart(2,'0')}Z`) + at % 1000;
        const next = at + wall - local;
        if (next === at) return remember(instants,key,at,2048);
        at = next;
      }
      // Horários inexistentes na mudança de DST exigem offset explícito.
      return NaN;
    } catch { return NaN; }
  }
  function dayKey(at, city) {
    try { return localParts(at,typeof city === 'string' ? city : city?.timezone).day; }
    catch { return null; }
  }
  function hourIndex(times, city, at = Date.now()) {
    if (!Array.isArray(times) || !times.length) return -1;
    const next = times.findIndex(time => parse(time,city) > at);
    return next < 0 ? times.length - 1 : Math.max(0,next - 1);
  }
  return {parse,wallTime,dayKey,localParts,hourIndex,dateFormat,numberFormat};
});
