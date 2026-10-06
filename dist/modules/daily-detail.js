(function(root,factory) {
  const common=typeof module==='object' && module.exports;
  const api=factory(common ? require('./hourly-detail.js') : root.PLUVIA?.hourlyDetail,common ? require('./city-time.js') : root.PLUVIA?.time);
  if(common) module.exports=api;
  (root.PLUVIA=root.PLUVIA||{}).dailyDetail=api;
  if(root.document) api.mount(root);
})(globalThis,function(hourlyDetail,time) {
  'use strict';
  const number=(v,min,max)=>typeof v==='number' && Number.isFinite(v) && v>=min && v<=max ? v : null;
  const format=(v,digits=0)=>v===null ? 'Indisponível' : v.toLocaleString('pt-BR',{maximumFractionDigits:digits});
  function detail(daily,hourly,index,city) {
    const date=daily?.time?.[index];
    if(!Number.isInteger(index) || index<0 || !/^\d{4}-\d{2}-\d{2}$/.test(date||'') || !Number.isFinite(time.wallTime(date+'T12:00'))) return null;
    const next=new Date(time.wallTime(date+'T12:00')+86400000).toISOString().slice(0,10);
    const start=time.parse(date+'T00:00',city),end=time.parse(next+'T00:00',city);
    const seen=new Set(),hours=[];
    for(let i=0;i<(hourly?.time?.length||0);i++) {
      const stamp=time.parse(hourly.time[i],city);
      if(!Number.isFinite(stamp) || stamp<start || stamp>=end || seen.has(stamp)) continue;
      const reading=hourlyDetail.detail(hourly,i);
      if(!reading) continue;
      seen.add(stamp);hours.push({...reading,stamp});
    }
    hours.sort((a,b)=>a.stamp-b.stamp);
    const max=key=>{const values=hours.map(h=>h[key]).filter(v=>v!==null);return values.length ? Math.max(...values) : null;};
    const expected=Number.isFinite(start) && Number.isFinite(end) ? (end-start)/3600000 : null;
    return {index,date,hours,expectedHours:expected,complete:expected!==null && hours.length===expected,
      min:number(daily.temperature_2m_min?.[index],-90,70),max:number(daily.temperature_2m_max?.[index],-90,70),
      feelsMin:number(daily.apparent_temperature_min?.[index],-120,100),feelsMax:number(daily.apparent_temperature_max?.[index],-120,100),
      code:number(daily.weather_code?.[index],0,99),probability:number(daily.precipitation_probability_max?.[index],0,100),
      mm:number(daily.precipitation_sum?.[index],0,3000),uv:number(daily.uv_index_max?.[index],0,30),
      wind:max('wind'),gust:max('gust')};
  }
  function mount(root) {
    const doc=root.document,el=id=>doc.getElementById(id),dialog=el('dailyDetailDialog');
    if(!dialog) return;
    let state=null,selectedDate=null,opener=null;
    const unit=(value,suffix,digits=0)=>value===null ? 'Indisponível' : format(value,digits)+suffix;
    const stamp=value=>Number.isFinite(value) ? new Intl.DateTimeFormat('pt-BR',{timeZone:state.city.timezone,hour:'2-digit',minute:'2-digit'}).format(value) : 'Indisponível';
    function available() {
      const today=time.dayKey(state.at||Date.now(),state.city);
      return (state.daily.time||[]).map((date,index)=>({date,index})).filter(r=>r.date>=today).slice(0,7);
    }
    function paint() {
      const index=state?.daily.time.indexOf(selectedDate),reading=state && detail(state.daily,state.hourly,index,state.city);
      if(!reading || !available().some(day=>day.date===selectedDate)) {if(dialog.open) dialog.close();return false;}
      const date=new Date(reading.date+'T12:00:00Z');
      el('dailyDetailTitle').textContent=new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(date);
      el('dailyDetailCity').textContent=state.city.name+'/'+state.city.uf;
      el('dailyDetailCondition').textContent=reading.code===null ? 'Condição indisponível' : root.PLUVIA.weatherIcons.condition(reading.code).label;
      for(const [id,value,suffix,digits] of [
        ['dailyDetailMin',reading.min,'°'],['dailyDetailMax',reading.max,'°'],
        ['dailyDetailFeelsMin',reading.feelsMin,'°'],['dailyDetailFeelsMax',reading.feelsMax,'°'],
        ['dailyDetailProbability',reading.probability,'%'],['dailyDetailRain',reading.mm,' mm',1],
        ['dailyDetailWind',reading.wind,' km/h'],['dailyDetailGust',reading.gust,' km/h'],['dailyDetailUv',reading.uv,'']
      ]) el(id).textContent=unit(value,suffix,digits);
      const spread=root.PLUVIA.forecastSpread,spreadText=spread?.describe?.(spread.peek?.(state.city.id)?.days?.[reading.date])||'';
      if(el('dailyDetailSpread')) {el('dailyDetailSpread').textContent=spreadText;el('dailyDetailSpread').hidden=!spreadText;}
      const solar=state.dayAt?.(time.parse(reading.date+'T12:00',state.city));
      el('dailyDetailSunrise').textContent=stamp(solar?.rise);el('dailyDetailSunset').textContent=stamp(solar?.set);
      el('dailyDetailHoursNote').textContent=reading.hours.length ? `${reading.hours.length} horários disponíveis${reading.complete ? ' para este dia' : ' · dados horários parciais'}. Vento e rajadas representam os maiores valores desses horários.` : 'Detalhes horários indisponíveis para este dia. Os totais acima vêm da previsão diária.';
      el('dailyDetailSource').textContent=(state.fromCache ? 'Dados salvos · ' : 'Previsão por modelos · ')+`MET Norway / Open-Meteo · horário de ${state.city.name}.`;
      const list=el('dailyDetailHours'),scroll=list.scrollLeft,focused=doc.activeElement;
      const existing=new Map([...list.children].map(button=>[button.dataset.hourTime,button])),buttons=[];
      for(const hour of reading.hours) {
        const button=existing.get(hour.time)||doc.createElement('button');button.type='button';button.className='daily-hour';
        button.dataset.hourTime=hour.time;
        button.dataset.hourIndex=hour.index;button.dataset.detailDay=reading.date;
        button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','hourlyDetailDialog');
        const clock=stamp(hour.stamp);
        button.setAttribute('aria-label',`${clock}, ${unit(hour.temperature,' graus')}, sensação ${unit(hour.feelsLike,' graus')}, chance de chuva ${unit(hour.probability,'%')}, ${unit(hour.mm,' mm',1)}. Ver detalhes.`);
        const label=doc.createElement('span');label.textContent=clock;
        const icon=doc.createElement('span');icon.setAttribute('aria-hidden','true');icon.innerHTML=hour.code===null ? '' : root.PLUVIA.weatherIcons.markup(hour.code,state.isDayAt?.(hour.time),{decorative:true});
        const temperature=doc.createElement('strong');temperature.textContent=unit(hour.temperature,'°');
        const feels=doc.createElement('small');feels.textContent='Sens. '+unit(hour.feelsLike,'°');
        const rain=doc.createElement('small');rain.textContent=unit(hour.probability,'%')+' · '+unit(hour.mm,' mm',1);
        button.replaceChildren(label,icon,temperature,feels,rain);buttons.push(button);
      }
      list.replaceChildren(...buttons);list.scrollLeft=scroll;
      if(focused?.classList.contains('daily-hour') && focused.isConnected) focused.focus({preventScroll:true});
      const days=available(),position=days.findIndex(day=>day.date===selectedDate);
      el('dailyDetailPrev').disabled=position<=0;el('dailyDetailNext').disabled=position>=days.length-1;
      return true;
    }
    function update(next) {
      if(!next?.daily || !next.city) return;
      if(state && state.city.id!==next.city.id && dialog.open) dialog.close();
      state=next;if(dialog.open) paint();
    }
    doc.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-day-index]');
      if(!button || !button.closest('#forecastList') || !state) return;
      selectedDate=state.daily.time[Number(button.dataset.dayIndex)];opener=button;
      if(paint() && !dialog.open) dialog.showModal();
    });
    const close=()=>root.PLUVIA?.dialogs?.close(dialog) ?? dialog.close();
    el('dailyDetailClose').addEventListener('click',close);
    dialog.addEventListener('click',event=>{if(event.target===dialog) close();});
    dialog.addEventListener('close',()=>{
      const target=opener?.isConnected ? opener : doc.querySelector(`#forecastList [data-day-index="${state?.daily.time.indexOf(selectedDate)}"]`);
      target?.focus({preventScroll:true});
    });
    function move(delta) {
      const days=available(),position=days.findIndex(day=>day.date===selectedDate)+delta;
      if(position<0 || position>=days.length) return;
      selectedDate=days[position].date;paint();dialog.querySelector('.dialog-scroll').scrollTop=0;
    }
    el('dailyDetailPrev').addEventListener('click',()=>move(-1));el('dailyDetailNext').addEventListener('click',()=>move(1));
    root.addEventListener('pluvia:city-changed',()=>{if(dialog.open) dialog.close();state=null;selectedDate=null;});
    root.addEventListener('pluvia:forecast-spread',event=>{if(dialog.open && state?.city.id===event.detail?.cityId) paint();});
    root.PLUVIA.dailyDetail.update=update;
  }
  return {detail,mount};
});
