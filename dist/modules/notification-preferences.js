(function(root,factory) {
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.PLUVIA=root.PLUVIA || {};root.PLUVIA.notificationPreferences=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function() {
  'use strict';
  const fields=['official_alerts','rain_approaching','heavy_rain','storms','strong_wind','extreme_heat','air_quality','weather_changes','daily_summary'];
  function defaults(saved={}) {
    const next={notifications_enabled:true,official_alerts:true,rain_approaching:true,heavy_rain:true,storms:true,
      strong_wind:true,extreme_heat:true,air_quality:true,weather_changes:true,daily_summary:false,
      lightning:false,minimum_severity:1,quiet_start:null,quiet_end:null,daily_summary_time:'07:00'};
    for(const field of ['notifications_enabled',...fields]) if(typeof saved?.[field]==='boolean') next[field]=saved[field];
    const time=String(saved?.daily_summary_time || '').slice(0,5);
    if(/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) next.daily_summary_time=time;
    if(typeof saved?.timezone==='string') next.timezone=saved.timezone;
    return next;
  }
  function collect(form,saved) {
    const next=defaults(saved);
    for(const field of fields) {const input=form.elements.namedItem(field);if(input) next[field]=input.checked;}
    const time=form.elements.namedItem('daily_summary_time')?.value;
    if(/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) next.daily_summary_time=time;
    return next;
  }
  function selectedCities(inputs) {
    const ids=[...new Set(Array.from(inputs).filter(input=>input.checked).map(input=>input.dataset.notificationCity).filter(id=>/^\d{7}$/.test(id)))];
    if(ids.length>30) throw Error('Escolha até 30 cidades por vez.');
    return ids;
  }
  return {fields,defaults,collect,selectedCities};
});
