(function(root,factory) {
  const api=factory(typeof module==='object' && module.exports ? require('./modules/city-time.js') : root.PLUVIA?.time);
  if (typeof module==='object' && module.exports) module.exports=api;
  if(root.document) api.mount(root);
})(typeof globalThis!=='undefined' ? globalThis : this,function(time) {
  'use strict';
  const FRESH_MS=20*60*1000, MAX_AGE_MS=36*60*60*1000;
  function snapshot(data,at=Date.now()) {
    const current=data?.current;
    if (!Number.isFinite(current?.temperature_2m) || !Number.isFinite(current?.weather_code)) return null;
    const times=data.hourly?.time || [], next=times.findIndex(time=>time>String(current.time || ''));
    const start=next < 0 ? times.length-1 : Math.max(0,next-1);
    const probs=(data.hourly?.precipitation_probability || []).slice(start+1,start+4);
    const continuous = times.slice(start,start+4).length===4 && times.slice(start,start+4).every((stamp,i)=>Number.isFinite(time?.wallTime(stamp)) && (!i || time.wallTime(stamp)-time.wallTime(times[start+i-1])===3600000));
    const day=typeof current.time==='string' ? current.time.slice(0,10) : null;
    const dailyIndex=data.daily?.time?.indexOf(day) ?? -1;
    const finite=value=>typeof value==='number' && Number.isFinite(value) ? value : null;
    return {temperature:current.temperature_2m,feelsLike:finite(current.apparent_temperature),
      high:finite(data.daily?.temperature_2m_max?.[dailyIndex]),low:finite(data.daily?.temperature_2m_min?.[dailyIndex]),day,
      code:current.weather_code,isDay:current.is_day!==0,rain:continuous && probs.length===3 && probs.every(value=>Number.isFinite(value) && value>=0 && value<=100) ? Math.max(...probs) : null,at};
  }
  function valid(value,now=Date.now()) {
    return Boolean(value && Number.isFinite(value.temperature) && Number.isFinite(value.code) && Number.isFinite(value.at) && now>=value.at && now-value.at<=MAX_AGE_MS);
  }
  function mount(root) {
    const doc=root.document,el=id=>doc.getElementById(id);
    if(!el('dialogFavoriteList')) return;
    const snapshots=new Map(), errors=new Set(), pending=new Set(), queue=[];
    let running=0, opening=false;
    const service=root.PLUVIA?.services?.createServices({client:root.PLUVIA?.http?.createClient?.({defaultTimeoutMs:9000})});
    const ids=()=>typeof favorites!=='undefined' ? [...favorites].filter(id=>/^\d{7}$/.test(id)).slice(0,30) : [];
    const current=()=>typeof activeCity!=='undefined' ? activeCity : null;
    const status=text=>{el('dialogFavoriteStatus').textContent=text;};
    function read(id) {
      if(valid(snapshots.get(id))) return snapshots.get(id);
      try {
        const cached=JSON.parse(root.localStorage.getItem('pluvia-favorite-weather-'+id) || 'null');
        if(valid(cached)) {snapshots.set(id,cached);return cached;}
        const weather=JSON.parse(root.localStorage.getItem('pluvia-weather-'+id) || 'null');
        const value=snapshot(weather?.data?.forecast,weather?.weatherAt ?? weather?.at);
        if(valid(value)) {snapshots.set(id,value);return value;}
      } catch {}
      return null;
    }
    function card(id) {
      const city=typeof cityById!=='undefined' ? cityById.get(id) : null;
      const button=doc.createElement('button');button.type='button';button.className='favorite-city-card';button.dataset.favoriteId=id;
      button.setAttribute('aria-current',String(current()?.id===id));button.disabled=opening;
      const name=doc.createElement('strong'),reading=doc.createElement('span'),summary=doc.createElement('span'),stamp=doc.createElement('small');
      name.textContent=city ? city.name+'/'+city.uf : 'Cidade favorita';
      const value=read(id); reading.className='favorite-reading';summary.className='favorite-summary';
      reading.textContent=value ? Math.round(value.temperature)+'°' : errors.has(id) ? 'Indisponível' : 'Consultando…';
      summary.textContent=value ? root.PLUVIA?.weatherIcons?.condition(value.code)?.label || 'Condição prevista' : 'Toque para abrir a previsão';
      stamp.textContent=value ? `${value.rain===null ? 'Chuva indisponível' : Math.round(value.rain)+'% de chuva em 3h'} · ${Date.now()-value.at>FRESH_MS ? 'leitura salva' : 'atualizado há '+Math.max(0,Math.floor((Date.now()-value.at)/60000))+' min'}` : '';
      button.append(name,reading,summary);
      if(value) {
        const thermal=doc.createElement('span');thermal.className='favorite-summary';
        thermal.textContent=Number.isFinite(value.feelsLike) ? 'Sensação '+Math.round(value.feelsLike)+'°' : 'Sensação indisponível';
        const range=doc.createElement('small');
        const today=city?.timezone ? time?.dayKey(Date.now(),city) : null;
        range.textContent=Number.isFinite(value.high) && Number.isFinite(value.low) ? `Máx. ${Math.round(value.high)}° · Mín. ${Math.round(value.low)}°${value.day && today!==value.day ? ' · '+value.day.slice(8,10)+'/'+value.day.slice(5,7) : ''}` : 'Máxima/mínima indisponíveis';
        const local=doc.createElement('small');
        try {local.textContent=new Intl.DateTimeFormat('pt-BR',{timeZone:city?.timezone,hour:'2-digit',minute:'2-digit'}).format(new Date())+' · horário local';} catch {local.textContent='Horário local indisponível';}
        if(!city?.timezone) local.textContent='Horário local indisponível';
        button.append(thermal,range,local);
      }
      button.append(stamp);return button;
    }
    const observer='IntersectionObserver' in root ? new root.IntersectionObserver(entries=>{
      for(const entry of entries) if(entry.isIntersecting) {observer.unobserve(entry.target);enqueue(entry.target.dataset.favoriteId);}
    },{rootMargin:'80px'}) : null;
    function paint() {
      const values=ids();observer?.disconnect();
      el('dialogFavorites').hidden=!values.length;
      const list=el('dialogFavoriteList');list.replaceChildren(...values.map(card));
      for(const button of list.children) observer ? observer.observe(button) : enqueue(button.dataset.favoriteId);
    }
    function enqueue(id) {
      const cached=read(id);
      if(!ids().includes(id) || pending.has(id) || errors.has(id) || cached && Date.now()-cached.at<FRESH_MS || root.navigator.onLine===false) return;
      pending.add(id);queue.push(id);pump();
    }
    function pump() {
      while(running<2 && queue.length) {
        const id=queue.shift();running++;
        Promise.resolve().then(async()=>{
          if(!ids().includes(id)) return;
          const city=await ensureCityDetails(id);if(!city) throw Error('city');
          const data=await service.weather.getBrief(city,{timeoutMs:9000});
          const value=snapshot(data);if(!value) throw Error('data');
          snapshots.set(id,value);errors.delete(id);
          try {root.localStorage.setItem('pluvia-favorite-weather-'+id,JSON.stringify(value));} catch {}
        }).catch(()=>errors.add(id)).finally(()=>{running--;pending.delete(id);paint();pump();});
      }
    }
    async function open(event) {
      const button=event.target.closest('[data-favorite-id]');if(!button || opening) return;
      const id=button.dataset.favoriteId;if(!ids().includes(id)) return;
      opening=true;status('Abrindo cidade…');paint();
      try {const city=await ensureCityDetails(id);if(!city) throw Error('city');chooseCity(id,city);status('');}
      catch {status('Não foi possível abrir. Confira a conexão e tente novamente.');}
      finally {opening=false;paint();}
    }
    el('dialogFavoriteList').addEventListener('click',open);
    root.addEventListener('pluvia:favorites-changed',()=>{status('');paint();});
    root.addEventListener('pluvia:city-changed',paint);
    root.addEventListener('pluvia:favorites-loaded',paint);
    root.addEventListener('pluvia:auth-changed',()=>root.setTimeout(paint,0));
    root.addEventListener('pluvia:weather-updated',event=>{
      const id=event.detail?.cityId;
      if(id && ids().includes(id) && typeof displayedWeather!=='undefined') {
        const value=snapshot(displayedWeather?.forecast,displayedWeather?.weatherAt);if(value) snapshots.set(id,value);
      }
      paint();
    });
    root.addEventListener('online',()=>{errors.clear();paint();});
    doc.addEventListener('visibilitychange',()=>{if(!doc.hidden) {errors.clear();paint();}});
    paint();
  }
  return {snapshot,valid,mount,FRESH_MS,MAX_AGE_MS};
});
