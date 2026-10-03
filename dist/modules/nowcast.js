/* Observations and inference are separate. No model probabilities enter this module. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else {root.PLUVIA=root.PLUVIA || {};root.PLUVIA.nowcast=api.mount(root);}
})(globalThis,function(){
  const MINUTE=60000,ENDPOINT='https://dszyyrcvwrpyiypwyvxe.supabase.co/functions/v1/nowcast';
  const finite=value=>typeof value==='number' && Number.isFinite(value);
  const localOrigin=address=>address?.protocol==='http:' && ['localhost','127.0.0.1'].includes(address.hostname);
  const within=(point,b)=>point && b && finite(point.lat) && finite(point.lon) && point.lat>=b.south && point.lat<=b.north && point.lon>=b.west && point.lon<=b.east;
  function capabilities(value) {
    if(value?.schemaVersion!==1 || !Array.isArray(value.regions) || value.regions.length>20) throw new Error('invalid_response');
    if(value.regions.some(r=>typeof r.id!=='string' || !/^[a-z0-9-]{1,40}$/.test(r.id) ||
      !r.bounds || !['south','north','east','west'].every(k=>finite(r.bounds[k])) ||
      r.bounds.south>=r.bounds.north || r.bounds.west>=r.bounds.east || Math.abs(r.bounds.north)>90 || Math.abs(r.bounds.south)>90 ||
      Math.abs(r.bounds.east)>180 || Math.abs(r.bounds.west)>180)) throw new Error('invalid_response');
    return value.regions;
  }
  function validateResult(value,{region,point,now=Date.now(),allowMock=false}={}) {
    const time=t=>finite(t) && t>0 && t<=now+MINUTE;
    const statuses=['INSUFFICIENT','NEARBY','FORMING','STATIONARY','APPROACHING','MOVING_AWAY','NO_SIGNIFICANT_RAIN','OUTSIDE_RADAR_COVERAGE'];
    if(value?.schemaVersion!==1 || value.regionId!==region?.id || value.reference!=='municipality' ||
      value.mock!==false && !(allowMock && value.mock===true) || !time(value.evaluatedAt) || now-value.evaluatedAt>6*MINUTE ||
      !finite(value.validUntil) || value.validUntil>value.evaluatedAt+5*MINUTE || value.validUntil<value.evaluatedAt ||
      !statuses.includes(value.status) || !value.location || !finite(value.location.lat) || !finite(value.location.lon) ||
      Math.abs(value.location.lat-point.lat)>.001 || Math.abs(value.location.lon-point.lon)>.001 ||
      !['LOW','MEDIUM','HIGH'].includes(value.confidence?.level) || value.confidence.level==='HIGH' && value.confidence.calibrated!==true ||
      !Array.isArray(value.stations) || value.stations.length>10 || !Array.isArray(value.sources) || value.sources.length>5) throw new Error('invalid_response');
    if(value.stations.some(s=>s?.kind!=='observation' || typeof s.stationId!=='string' || s.stationId.length>10 ||
      !time(s.observedAt) || !time(s.ingestedAt) || s.ingestedAt<s.observedAt-MINUTE || !finite(s.validUntil) ||
      s.validUntil>s.observedAt+90*MINUTE || !finite(s.lat) || !finite(s.lon) || Math.abs(s.lat)>90 || Math.abs(s.lon)>180 ||
      !['reported','vicinity','not_reported'].includes(s.weather?.rain) || !['reported','vicinity','not_reported'].includes(s.weather?.thunderstorm))) throw new Error('invalid_response');
    if(value.observation && (value.observation.kind!=='observation' || !time(value.observation.observedAt) ||
      value.observation.distanceKm!=null && (!finite(value.observation.distanceKm) || value.observation.distanceKm<0))) throw new Error('invalid_response');
    if(value.inference) {
      const arrival=value.inference.arrival;
      if(value.inference.kind!=='inference' || !value.observation || value.status==='INSUFFICIENT' ||
        arrival && (value.status!=='APPROACHING' || value.confidence.level==='LOW' || !finite(arrival.earliestMinutes) || !finite(arrival.latestMinutes) ||
          arrival.earliestMinutes<0 || arrival.latestMinutes>120 || arrival.earliestMinutes>=arrival.latestMinutes)) throw new Error('invalid_response');
    }
    return value;
  }
  function stationText(station) {
    const weather=station?.weather || {},amount={light:'fraca',moderate:'moderada',strong:'forte'}[weather.intensity];
    const rain=weather.rain==='reported' ? 'Chuva'+(amount?' '+amount:'')+' reportada na estação' : weather.rain==='vicinity' ? 'Chuva reportada nas proximidades da estação' : 'O boletim não informa chuva na estação';
    return rain+(weather.thunderstorm==='reported' ? '; trovoada reportada' : weather.thunderstorm==='vicinity' ? '; trovoada nas proximidades' : '')+'.';
  }
  function createController({getJson,endpoint=ENDPOINT,clock=Date.now,allowMock=false,onChange=()=>{}}) {
    let regions=[],configuration=null,revision=0,currentKey=null,currentCity=null,data=null,error=null,pending=null,lastCheck=0,aborter=null;
    const cache=new Map();
    function snapshot() {
      if(!data) return null;
      const now=clock(),stale=now>=data.validUntil;
      let inference=stale?null:data.inference;
      if(inference?.arrival) {
        const elapsed=Math.max(0,Math.floor((now-data.evaluatedAt)/MINUTE)),arrival=inference.arrival;
        const latestMinutes=Math.max(0,Math.ceil((arrival.latestMinutes-elapsed)/5)*5);
        inference={...inference,arrival:latestMinutes>0?{
          earliestMinutes:Math.max(0,Math.floor((arrival.earliestMinutes-elapsed)/5)*5),latestMinutes}:null};
      }
      return {...data,stale,stations:data.stations.filter(s=>now<s.validUntil && now-s.observedAt<=90*MINUTE),
        confidence:stale?{...data.confidence,level:'LOW',score:0,reasons:['expired_analysis']}:data.confidence,inference};
    }
    function emit(){onChange({data:snapshot(),city:currentCity,error,loading:!!pending,regions});}
    function invalidate(city) {
      revision++;aborter?.abort();aborter=null;pending=null;data=null;error=null;lastCheck=0;
      currentCity=city || null;currentKey=city?`${city.id}:${city.lat}:${city.lon}`:null;emit();
    }
    async function configure() {
      if(regions.length) return regions;
      if(!configuration) configuration=Promise.resolve().then(()=>getJson(endpoint,{timeoutMs:10000})).then(value=>regions=capabilities(value)).finally(()=>configuration=null);
      return configuration;
    }
    function refresh(city,{force=false}={}) {
      const key=city?`${city.id}:${city.lat}:${city.lon}`:null;
      if(key!==currentKey) invalidate(city);
      if(!city) return Promise.resolve(null);
      if(pending) return pending;
      if(!force && lastCheck && clock()-lastCheck<5*MINUTE) return Promise.resolve(snapshot());
      const version=revision,controller=new AbortController();aborter=controller;error=null;
      const task=Promise.resolve().then(async()=>{
        await configure();if(version!==revision) return null;
        const region=regions.find(r=>within(city,r.bounds));
        if(!region){data=null;lastCheck=clock();return null;}
        const point={lat:Number(city.lat.toFixed(2)),lon:Number(city.lon.toFixed(2))},cacheKey=`${region.id}:${point.lat}:${point.lon}`;
        const saved=cache.get(cacheKey);
        if(!force && saved && clock()-saved.evaluatedAt<5*MINUTE && saved.validUntil>clock()) {data=saved;lastCheck=clock();return snapshot();}
        const url=new URL(endpoint);url.searchParams.set('region',region.id);url.searchParams.set('lat',point.lat);url.searchParams.set('lon',point.lon);
        const value=await getJson(url.href,{signal:controller.signal,timeoutMs:10000,cache:'no-store'});
        if(version!==revision) return null;
        data=validateResult(value,{region,point,now:clock(),allowMock});lastCheck=clock();
        cache.delete(cacheKey);cache.set(cacheKey,data);while(cache.size>10) cache.delete(cache.keys().next().value);
        return snapshot();
      }).catch(failure=>{if(version===revision && failure?.code!=='cancelled') {error=failure?.code || 'unavailable';lastCheck=clock();}return null;})
        .finally(()=>{if(version===revision) {pending=null;aborter=null;emit();}});
      pending=task;emit();return task;
    }
    return {refresh,invalidate,get:snapshot,tick:emit,regionFor:city=>regions.find(r=>within(city,r.bounds)) || null};
  }
  function mount(root) {
    const document=root.document,$=id=>document.getElementById(id),card=$('nowcastCard');
    if(!card || !root.PLUVIA?.http) return {refresh:()=>Promise.resolve(null),get:()=>null};
    const client=root.PLUVIA.http.createClient({defaultTimeoutMs:10000});
    const endpoint=localOrigin(root.location)?new URL('/api/nowcast',root.location.href).href:ENDPOINT;
    const city=()=>typeof activeCity!=='undefined'?activeCity:null;
    let renderedSignature='';
    const age=t=>Math.max(0,Math.floor((Date.now()-t)/MINUTE));
    function render({data,city:selected,error,loading,regions}) {
      const enabled=regions.some(r=>within(selected,r.bounds));card.hidden=!enabled;
      const signature=JSON.stringify({data,city:selected?.id,error,loading,minute:Math.floor(Date.now()/MINUTE)});
      if(signature===renderedSignature) return;renderedSignature=signature;
      if(!enabled) {root.dispatchEvent(new CustomEvent('pluvia:nowcast-updated'));return;}
      $('nowcastReference').textContent=`${selected.name}/${selected.uf} · referência do município`;
      $('nowcastMock').hidden=!data?.mock;
      const titles={APPROACHING:'Chuva se aproximando',NEARBY:'Chuva próxima',STATIONARY:'Chuva com pouco deslocamento',
        MOVING_AWAY:'Chuva se afastando',FORMING:'Novo eco de chuva',NO_SIGNIFICANT_RAIN:'Sem ecos significativos na cobertura'};
      $('nowcastTitle').textContent=data && !data.stale ? titles[data.status] || `Observações em ${selected.name}` : `Observações em ${selected.name}`;
      $('nowcastStatus').textContent=loading ? (data?'Atualizando observações…':'Consultando observações…') : error ?
        (data?'Não foi possível atualizar. Confira os horários dos dados abaixo.':'Observações temporariamente indisponíveis. Tente novamente.') : data?.stale ?
        'A análise expirou. Projeções foram suspensas até a próxima atualização.' : data?.status==='INSUFFICIENT' || !data ?
        'Dados insuficientes para um nowcast confiável neste momento.' : '';
      $('nowcastObserved').textContent='';
      $('nowcastSourceDetails').textContent='';
      if(data?.observation) {
        const paragraph=document.createElement('p');paragraph.textContent=data.observation.significantRain===false ?
          'Nenhum eco significativo na cobertura analisada no horário do radar. Isso não garante ausência de chuva na próxima hora.' :
          `Precipitação ${ {light:'fraca',moderate:'moderada',strong:'forte'}[data.observation.intensity] || ''} detectada a aproximadamente ${data.observation.distanceKm} km da referência municipal.`;
        $('nowcastObserved').appendChild(paragraph);
        const stamp=document.createElement('small');stamp.textContent=`${data.observation.source} · observação há ${age(data.observation.observedAt)} min${data.stale?' · análise expirada':''}`;
        $('nowcastObserved').appendChild(stamp);
      }
      for(const station of data?.stations || []) {
        const paragraph=document.createElement('p');paragraph.textContent=`${station.name}: ${stationText(station)}`;
        const stamp=document.createElement('small'),detail=document.createElement('p');
        const time=new Intl.DateTimeFormat('pt-BR',{timeZone:selected.timezone || 'UTC',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(station.observedAt);
        stamp.textContent=`${finite(station.temperatureC)?station.temperatureC+' °C · ':''}${time} · há ${age(station.observedAt)} min · METAR / NOAA`;
        detail.textContent=`${station.source} · ${station.stationId} · ${station.distanceKm} km da referência municipal · ${time}.`;
        $('nowcastSourceDetails').appendChild(detail);
        $('nowcastObserved').append(paragraph,stamp);
      }
      $('nowcastObserved').hidden=!$('nowcastObserved').childNodes.length;
      $('nowcastObserved').parentElement.hidden=$('nowcastObserved').hidden;
      $('nowcastInference').hidden=!data?.inference;
      const inference=data?.inference;
      $('nowcastArrival').textContent=inference?.arrival?`${inference.arrival.earliestMinutes}–${inference.arrival.latestMinutes} min`:'Sem estimativa de chegada';
      $('nowcastArrivalLabel').textContent=inference?.arrival?'Possível chegada':'Movimento';
      const directions=['norte','nordeste','leste','sudeste','sul','sudoeste','oeste','noroeste'];
      $('nowcastMotion').textContent=finite(inference?.bearingDegrees)?`Deslocamento estimado para ${directions[Math.round(inference.bearingDegrees/45)%8]} · cerca de ${inference.speedKmh} km/h.`:inference?.assumptions || '';
      $('nowcastConfidence').textContent=`Confiança do nowcast: ${ {LOW:'baixa',MEDIUM:'média',HIGH:'alta'}[data?.confidence?.level] || 'baixa'}${(data?.observation || data?.inference) && !data.confidence.calibrated?' · experimental':''}`;
      $('nowcastAssumptions').textContent=inference?.assumptions || '';
      $('nowcastMap').hidden=!data?.stations.length;$('nowcastRetry').disabled=loading;
      root.PLUVIA.sources?.set('stations',{status:data?.stations.length?'ready':loading?'loading':'error',dataAt:data?.stations[0]?.observedAt || null,checkedAt:Date.now()});
      root.dispatchEvent(new CustomEvent('pluvia:nowcast-updated'));
    }
    const controller=createController({endpoint,getJson:client.getJson,allowMock:localOrigin(root.location),onChange:render});
    root.addEventListener('pluvia:city-changed',()=>controller.invalidate(city()));
    root.addEventListener('pluvia:clock-updated',()=>controller.tick());
    $('nowcastRetry').addEventListener('click',()=>controller.refresh(city(),{force:true}));
    $('nowcastMap').addEventListener('click',()=>{root.PLUVIA.modules['weather-layers'].selectLayer?.('stations');$('weatherMap').scrollIntoView({behavior:root.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});});
    controller.stationText=stationText;
    controller.refresh(city());return controller;
  }
  return {createController,capabilities,validateResult,stationText,localOrigin,mount};
});
