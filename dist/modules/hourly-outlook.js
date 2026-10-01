(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {}; root.PLUVIA.hourlyOutlook = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const available = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  // Rain amounts and probabilities refer to the hour ending at the API time.
  function shiftHour(time, hours) {
    if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(time)) return null;
    const stamp = Date.parse(time.slice(0,16)+'Z');
    if (!Number.isFinite(stamp)) return null;
    return new Date(stamp + hours * 3600000).toISOString().slice(0,16);
  }
  const consecutive = (first,second) => shiftHour(first,1) === second?.slice(0,16);
  function build(hourly, start = 0, count = 12) {
    const times = Array.isArray(hourly?.time) ? hourly.time : [];
    const rows = times.slice(start, start + count).map((time, offset) => {
      const i = start + offset, probability = hourly.precipitation_probability?.[i], mm = hourly.precipitation?.[i];
      return {time, index:i, probability:available(probability) && probability <= 100 ? probability : null, mm:available(mm) ? mm : null};
    });
    const known = rows.filter(row => row.probability !== null && shiftHour(row.time,0));
    if (!known.length) return {kind:'unavailable', probability:null, volume:null, windowVolume:null, rows};
    const peak = known.reduce((best,row) => row.probability > best.probability ? row : best);
    let first = peak, last = peak;
    if (peak.probability >= 40) {
      const threshold = Math.max(40, peak.probability - 15), at = rows.indexOf(peak);
      for (let i=at-1;i>=0 && rows[i].probability !== null && rows[i].probability >= threshold && consecutive(rows[i].time,rows[i+1].time);i--) first=rows[i];
      for (let i=at+1;i<rows.length && rows[i].probability !== null && rows[i].probability >= threshold && consecutive(rows[i-1].time,rows[i].time);i++) last=rows[i];
    }
    const continuous=rows.every((row,i)=>shiftHour(row.time,0) && (!i || consecutive(rows[i-1].time,row.time)));
    const windowRows=rows.filter(row=>row.index>=first.index && row.index<=last.index);
    const windowStart=shiftHour(first.time,-1);
    return {kind:peak.probability < 30 ? 'low' : 'peak', probability:peak.probability,
      complete:known.length === count && continuous, start:windowStart, end:last.time,
      peakIndex:peak.index, detailIndex:times.findIndex(time=>time?.slice(0,16)===shiftHour(peak.time,-1)),
      windowVolume:windowRows.every(row=>row.mm!==null) ? windowRows.reduce((sum,row)=>sum+row.mm,0) : null,
      volume:rows.length === count && continuous && rows.every(row => row.mm !== null) ? rows.reduce((sum,row) => sum + row.mm,0) : null, rows};
  }
  return {build,available,shiftHour,consecutive};
});
