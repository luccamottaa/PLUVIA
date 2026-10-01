(function(root,factory) {
  const api=factory(typeof module==='object' && module.exports ? require('./city-time.js') : root.PLUVIA?.time);
  if(typeof module==='object' && module.exports) module.exports=api;
  root.PLUVIA=root.PLUVIA || {};root.PLUVIA.sharing=api;
  if(root.document) api.mount(root);
})(typeof globalThis!=='undefined' ? globalThis : this,function(time) {
  'use strict';
  const URL='https://pluviaweather.com.br/';
  function build(snapshot,condition='Condição prevista',now=Date.now()) {
    const city=snapshot?.location,current=snapshot?.current,checked=snapshot?.source?.checkedAt;
    if(!city?.id || !city.timezone || !Number.isFinite(current?.temperature) || !Number.isFinite(checked) || now<checked || now-checked>36*3600000) return null;
    const at=time?.parse(current.time,city);
    if(!Number.isFinite(at)) return null;
    const stamp=new Intl.DateTimeFormat('pt-BR',{timeZone:city.timezone,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(at));
    const saved=snapshot.source.freshness==='stale' || now-checked>5*60000 || now-at>90*60000;
    const lines=[`${city.name}/${city.region} · ${Math.round(current.temperature)} °C · ${condition}`];
    if(Number.isFinite(current.apparentTemperature)) lines.push(`Sensação ${Math.round(current.apparentTemperature)} °C`);
    lines.push(`${saved ? 'Leitura salva' : 'Dados meteorológicos'} de ${stamp} · horário local`,
      snapshot.source.weather==='met-norway+open-meteo' ? 'Previsão por modelos · MET Norway / Open-Meteo' : 'Previsão por modelos · Open-Meteo');
    return {title:'PLUVIA · '+city.name,text:lines.join('\n'),url:URL};
  }
  async function deliver(payload,navigator) {
    if(!payload) return 'unavailable';
    if(typeof navigator.share==='function') {
      try {await navigator.share(payload);return 'shared';}
      catch(error) {if(error?.name==='AbortError') return 'cancelled';}
    }
    if(typeof navigator.clipboard?.writeText==='function') {
      try {await navigator.clipboard.writeText(payload.text+'\n'+payload.url);return 'copied';} catch {}
    }
    return 'manual';
  }
  function mount(root) {
    const el=id=>root.document.getElementById(id),button=el('shareWeather'),dialog=el('shareWeatherDialog');
    if(!button || !dialog) return;
    let snapshot=null,busy=false,revision=0;
    if(typeof activeCity!=='undefined') snapshot=root.PLUVIA?.weatherData?.get(activeCity?.id);
    button.disabled=!build(snapshot);
    const status=text=>{el('shareWeatherStatus').textContent=text;};
    root.addEventListener('pluvia:weather-updated',event=>{
      snapshot=root.PLUVIA?.weatherData?.get(event.detail?.cityId);button.disabled=!build(snapshot);status('');
    });
    root.addEventListener('pluvia:city-changed',()=>{
      revision++;snapshot=null;button.disabled=true;status('');if(dialog.open) dialog.close();
    });
    button.addEventListener('click',async()=>{
      if(busy) return;
      const payload=build(snapshot,root.PLUVIA?.weatherIcons?.condition(snapshot?.current?.weatherCode)?.label);
      if(!payload) {status('Sem leitura recente para compartilhar. Atualize a previsão.');return;}
      const selected=revision;busy=true;button.disabled=true;
      try {
        const result=await deliver(payload,root.navigator);
        if(selected!==revision) return;
        if(result==='manual') {
          el('shareWeatherText').value=payload.text+'\n'+payload.url;dialog.showModal();el('shareWeatherText').focus();el('shareWeatherText').select();
        } else status(result==='copied' ? 'Previsão copiada.' : result==='shared' ? 'Previsão compartilhada.' : '');
      } finally {busy=false;button.disabled=!build(snapshot);}
    });
    el('shareWeatherClose').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',event=>{if(event.target===dialog) dialog.close();});
    dialog.addEventListener('close',()=>{if(!button.disabled) button.focus({preventScroll:true});});
  }
  return {build,deliver,mount};
});
