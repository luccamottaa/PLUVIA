(function(root,factory) {
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  root.PLUVIA=root.PLUVIA || {};root.PLUVIA.hourlyDetail=api;
  if(root.document) api.mount(root);
})(typeof globalThis!=='undefined' ? globalThis : this,function() {
  'use strict';
  const number=(value,min=-Infinity,max=Infinity)=>typeof value==='number' && Number.isFinite(value) && value>=min && value<=max ? value : null;
  const format=(value,digits=0)=>value===null || !Number.isFinite(value) ? 'Indisponível' : value.toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const clock=time=>typeof time==='string' ? time.slice(11,16) : '';
  function detail(hourly,index) {
    if(!Number.isInteger(index) || index<0 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(hourly?.time?.[index] || '')) return null;
    const time=hourly.time[index],next=hourly.time[index+1];
    const continuous=Date.parse(time.slice(0,16)+'Z')+3600000===Date.parse(next?.slice(0,16)+'Z');
    return {index,time,rainEnd:continuous ? next : null,
      temperature:number(hourly.temperature_2m?.[index],-90,70),
      feelsLike:number(hourly.apparent_temperature?.[index],-120,100),
      code:number(hourly.weather_code?.[index],0,99),
      probability:continuous ? number(hourly.precipitation_probability?.[index+1],0,100) : null,
      mm:continuous ? number(hourly.precipitation?.[index+1],0,1000) : null,
      wind:number(hourly.wind_speed_10m?.[index],0,500),gust:number(hourly.wind_gusts_10m?.[index],0,500),
      humidity:number(hourly.relative_humidity_2m?.[index],0,100)};
  }
  function rainCopy(outlook,reference) {
    if(!outlook || outlook.kind==='unavailable') return {title:'Previsão de chuva indisponível',text:'Tente novamente nas próximas horas.'};
    const partial=outlook.complete ? '' : 'Dados parciais · ';
    if(outlook.kind==='low') return {title:outlook.complete ? 'Baixa chance de chuva nas próximas 12h' : 'Baixa chance nos horários disponíveis',
      text:`${partial}Até ${Math.round(outlook.probability)}% de chance${outlook.volume===null ? ' · volume indisponível' : ' · '+format(outlook.volume,1)+' mm no período'}`};
    const firstDay=outlook.start?.slice(0,10),lastDay=outlook.end?.slice(0,10),today=reference?.slice(0,10);
    const timing=firstDay!==today ? 'Amanhã, ' : '';
    const endDay=firstDay!==lastDay ? ' de amanhã' : '';
    return {title:`${timing}${timing ? 'maior' : 'Maior'} chance das ${clock(outlook.start)} às ${clock(outlook.end)}${endDay}`,
      text:`${partial}${Math.round(outlook.probability)}% de chance · ${outlook.windowVolume===null ? 'volume indisponível' : format(outlook.windowVolume,1)+' mm nessa faixa'}`};
  }
  function mount(root) {
    const doc=root.document,el=id=>doc.getElementById(id),dialog=el('hourlyDetailDialog');
    if(!dialog) return;
    let state=null,selectedTime=null,opener=null;
    const unit=(value,suffix,digits=0)=>value===null ? 'Indisponível' : format(value,digits)+suffix;
    function bounds() {return {first:state?.start || 0,last:Math.min((state?.hourly.time.length || 0)-1,(state?.start || 0)+23)};}
    function paint() {
      const index=state?.hourly.time.indexOf(selectedTime),reading=detail(state?.hourly,index);
      if(!reading) {if(dialog.open) dialog.close();return;}
      const date=new Date(reading.time.slice(0,10)+'T12:00:00Z');
      const day=date.toLocaleDateString('pt-BR',{timeZone:'UTC',weekday:'short',day:'numeric',month:'short'});
      el('hourlyDetailTitle').textContent='Previsão para '+clock(reading.time);
      el('hourlyDetailCity').textContent=state.city.name+'/'+state.city.uf+' · '+day;
      const condition=root.PLUVIA?.weatherIcons?.condition(reading.code);
      el('hourlyDetailCondition').textContent=reading.code===null ? 'Condição indisponível' : condition?.label || 'Condição prevista';
      el('hourlyDetailIcon').innerHTML=reading.code===null ? '' : root.PLUVIA?.weatherIcons?.markup(reading.code,state.isDayAt?.(reading.time),{decorative:true}) || '';
      el('hourlyDetailTemperature').textContent=unit(reading.temperature,'°');
      el('hourlyDetailFeelsLike').textContent=unit(reading.feelsLike,'°');
      el('hourlyDetailRain').textContent=unit(reading.probability,'%');
      el('hourlyDetailVolume').textContent=unit(reading.mm,' mm',1);
      el('hourlyDetailWind').textContent=unit(reading.wind,' km/h');
      el('hourlyDetailGust').textContent=unit(reading.gust,' km/h');
      el('hourlyDetailHumidity').textContent=unit(reading.humidity,'%');
      el('hourlyDetailRainInterval').textContent=reading.rainEnd ? `Chuva prevista entre ${clock(reading.time)} e ${clock(reading.rainEnd)}${reading.rainEnd.slice(0,10)!==reading.time.slice(0,10) ? ' do dia seguinte' : ''}.` : 'Intervalo de chuva indisponível.';
      el('hourlyDetailSource').textContent=(state.fromCache ? 'Leitura salva · ' : 'Previsão por modelos · ')+`horário de ${state.city.name}.`;
      const range=bounds();el('hourlyDetailPrev').disabled=index<=range.first;el('hourlyDetailNext').disabled=index>=range.last;
    }
    function update(next) {
      if(!next?.hourly || !next.city) return;
      if(state && state.city.id!==next.city.id && dialog.open) dialog.close();
      state=next;
      const outlook=root.PLUVIA?.hourlyOutlook?.build(next.hourly,next.start+1);
      const copy=rainCopy(outlook,next.hourly.time[next.start]);
      el('heroRainTitle').textContent=copy.title;el('heroRainText').textContent=copy.text;
      el('heroRainStatus').textContent=next.fromCache ? 'Leitura salva · previsão estimada' : 'Previsão estimada';
      el('heroRainOpen').disabled=outlook?.kind==='unavailable' || !outlook;
      el('heroRainOpen').dataset.hourIndex=String(outlook?.kind==='peak' && outlook.detailIndex>=next.start ? outlook.detailIndex : next.start);
      if(dialog.open) paint();
    }
    function open(index,button) {
      const range=bounds();
      if(!state || index<range.first || index>range.last || !detail(state.hourly,index)) return;
      selectedTime=state.hourly.time[index];opener=button;paint();
      if(!dialog.open) dialog.showModal();
    }
    doc.addEventListener('click',event=>{
      const button=event.target.closest?.('[data-hour-index]');
      if(button && !button.disabled && (button.closest('#weatherView') || button.id==='heroRainOpen')) open(Number(button.dataset.hourIndex),button);
    });
    el('hourlyDetailClose').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('click',event=>{if(event.target===dialog) dialog.close();});
    dialog.addEventListener('close',()=>{if(opener?.isConnected) opener.focus({preventScroll:true});});
    function move(delta) {
      const index=(state?.hourly.time.indexOf(selectedTime) ?? -1)+delta,range=bounds();
      if(index<range.first || index>range.last) return;
      selectedTime=state.hourly.time[index];paint();
    }
    el('hourlyDetailPrev').addEventListener('click',()=>move(-1));el('hourlyDetailNext').addEventListener('click',()=>move(1));
    dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft' || event.key==='ArrowRight') {event.preventDefault();move(event.key==='ArrowLeft' ? -1 : 1);}});
    root.addEventListener('pluvia:city-changed',()=>{
      if(dialog.open) dialog.close();state=null;selectedTime=null;
      el('heroRainTitle').textContent='Consultando a chuva…';el('heroRainText').textContent='';el('heroRainStatus').textContent='';el('heroRainOpen').disabled=true;
    });
    root.PLUVIA.hourlyDetail.update=update;
  }
  return {detail,rainCopy,mount};
});
