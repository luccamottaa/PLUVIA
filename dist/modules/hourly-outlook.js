(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {}; root.PLUVIA.hourlyOutlook = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const available = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  function build(hourly, start = 0, count = 12) {
    const times = Array.isArray(hourly?.time) ? hourly.time : [];
    const rows = times.slice(start, start + count).map((time, offset) => {
      const i = start + offset, probability = hourly.precipitation_probability?.[i], mm = hourly.precipitation?.[i];
      return {time, index:i, probability:available(probability) && probability <= 100 ? probability : null, mm:available(mm) ? mm : null};
    });
    const known = rows.filter(row => row.probability !== null);
    if (!known.length) return {kind:'unavailable', probability:null, volume:null, rows};
    const peak = known.reduce((best,row) => row.probability > best.probability ? row : best);
    let first = peak, last = peak;
    if (peak.probability >= 40) {
      const threshold = Math.max(40, peak.probability - 15), at = rows.indexOf(peak);
      for (let i=at-1;i>=0 && rows[i].probability !== null && rows[i].probability >= threshold;i--) first=rows[i];
      for (let i=at+1;i<rows.length && rows[i].probability !== null && rows[i].probability >= threshold;i++) last=rows[i];
    }
    return {kind:peak.probability < 30 ? 'low' : 'peak', probability:peak.probability,
      complete:known.length === count, start:first.time, end:times[last.index + 1] || last.time,
      volume:rows.length === count && rows.every(row => row.mm !== null) ? rows.reduce((sum,row) => sum + row.mm,0) : null, rows};
  }
  return {build,available};
});
