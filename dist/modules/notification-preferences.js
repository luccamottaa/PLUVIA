(function(root,factory) {
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.PLUVIA=root.PLUVIA || {};root.PLUVIA.notificationPreferences=api;
})(typeof globalThis!=='undefined' ? globalThis : this,function() {
  'use strict';
  const fields=['official_alerts','rain_approaching','heavy_rain','storms','strong_wind','extreme_heat','air_quality','weather_changes','daily_summary'];
  const clock=value=>typeof value==='string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value) ? value.slice(0,5) : null;
  const timezone=value=>{try {if(typeof value!=='string' || !value) return false;new Intl.DateTimeFormat('pt-BR',{timeZone:value});return true;} catch {return false;}};
  function defaults(saved={}) {
    const next={notifications_enabled:true,official_alerts:true,rain_approaching:true,heavy_rain:true,storms:true,
      strong_wind:true,extreme_heat:true,air_quality:true,weather_changes:true,daily_summary:false,
      lightning:false,minimum_severity:1,quiet_start:null,quiet_end:null,daily_summary_time:'07:00'};
    for(const field of ['notifications_enabled',...fields]) if(typeof saved?.[field]==='boolean') next[field]=saved[field];
    const time=clock(saved?.daily_summary_time);
    if(time) next.daily_summary_time=time;
    if(Number.isInteger(saved?.minimum_severity) && saved.minimum_severity>=1 && saved.minimum_severity<=4) next.minimum_severity=saved.minimum_severity;
    if(clock(saved?.quiet_start) && clock(saved?.quiet_end)) {next.quiet_start=clock(saved.quiet_start);next.quiet_end=clock(saved.quiet_end);}
    if(timezone(saved?.timezone)) next.timezone=saved.timezone;
    return next;
  }
  function collect(form,saved) {
    const next=defaults(saved);
    for(const field of fields) {const input=form.elements.namedItem(field);if(input) next[field]=input.checked;}
    const time=form.elements.namedItem('daily_summary_time')?.value;
    if(/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) next.daily_summary_time=time;
    const severity=form.elements.namedItem('minimum_severity');
    if(severity) {const value=Number(severity.value);if(!Number.isInteger(value) || value<1 || value>4) throw Error('Escolha um nível de aviso válido.');next.minimum_severity=value;}
    const quiet=form.elements.namedItem('quiet_enabled');
    if(quiet) {
      next.quiet_start=quiet.checked ? clock(form.elements.namedItem('quiet_start')?.value) : null;
      next.quiet_end=quiet.checked ? clock(form.elements.namedItem('quiet_end')?.value) : null;
      if(quiet.checked && (!next.quiet_start || !next.quiet_end || next.quiet_start===next.quiet_end)) throw Error('Escolha início e fim diferentes para o horário de silêncio.');
    }
    const zone=form.elements.namedItem('timezone');
    if(zone) {if(!timezone(zone.value)) throw Error('Escolha o fuso horário dos alertas.');next.timezone=zone.value;}
    return next;
  }
  function selectedCities(inputs) {
    const ids=[...new Set(Array.from(inputs).filter(input=>input.checked).map(input=>input.dataset.notificationCity).filter(id=>/^\d{7}$/.test(id)))];
    if(ids.length>30) throw Error('Escolha até 30 cidades por vez.');
    return ids;
  }
  return {fields,defaults,collect,selectedCities};
});
