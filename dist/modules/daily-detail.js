(function(root,factory) {
  const common=typeof module==='object' && module.exports;
  const api=factory(common ? require('./hourly-detail.js') : root.PLUVIA?.hourlyDetail,common ? require('./city-time.js') : root.PLUVIA?.time);
  if(common) module.exports=api;
  (root.PLUVIA=root.PLUVIA||{}).dailyDetail=api;
  if(root.document) api.mount(root);
})(globalThis,function(hourlyDetail,time) {
  'use strict';
  const number=(v,min,max)=>typeof v==='number' && Number.isFinite(v) && v>=min && v<=max ? v : null;
  const numberFormats=new Map();
  const format=(v,digits=0)=>v===null ? 'Indisponível' : (numberFormats.get(digits) || numberFormats.set(digits,new Intl.NumberFormat('pt-BR',{maximumFractionDigits:digits})).get(digits)).format(v);
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
    return {index,date,start,end,hours,expectedHours:expected,complete:expected!==null && hours.length===expected,
      min:number(daily.temperature_2m_min?.[index],-90,70),max:number(daily.temperature_2m_max?.[index],-90,70),
      feelsMin:number(daily.apparent_temperature_min?.[index],-120,100),feelsMax:number(daily.apparent_temperature_max?.[index],-120,100),
      code:number(daily.weather_code?.[index],0,99),probability:number(daily.precipitation_probability_max?.[index],0,100),
      mm:number(daily.precipitation_sum?.[index],0,3000),uv:number(daily.uv_index_max?.[index],0,30),
      wind:max('wind'),gust:max('gust')};
  }
  // Gráfico do dia no estilo do app Tempo: curva da temperatura hora a hora (traço e área no degradê
  // frio → quente da faixa do dia), mínima e máxima marcadas, "Agora" no dia de hoje e, embaixo, barras de
  // chuva proporcionais só ao volume (raiz de mm até 10 mm, como as Próximas horas; chance nunca aumenta a
  // barra). Hora sem leitura quebra a curva em vez de ligar os pontos. SVG decorativo (aria-hidden): os
  // números continuam na lista acessível. Puro: devolve o markup ou '' sem pelo menos 4 temperaturas.
  const CHART={w:320,top:22,plot:96,rain:30,gap:14,left:6,right:6};
  // Escala comum ao desenho e ao dedo (chartPoint): mesmas horas, mesma faixa de temperatura.
  function scale(reading) {
    const span=Number.isFinite(reading?.start) && Number.isFinite(reading?.end) && reading.end>reading.start ? reading.end-reading.start : null;
    const temps=(reading?.hours||[]).filter(h=>typeof h.temperature==='number' && Number.isFinite(h.temperature));
    if(!span || temps.length<4) return null;
    const {w,top,plot,rain,gap,left,right}=CHART,height=top+plot+gap+rain+18;
    const x=stamp=>left+Math.max(0,Math.min(1,(stamp-reading.start)/span))*(w-left-right);
    let low=Math.min(...temps.map(h=>h.temperature)),high=Math.max(...temps.map(h=>h.temperature));
    if(high-low<4){const mid=(high+low)/2;low=Math.min(low,mid-2);high=Math.max(high,mid+2);}
    const y=t=>top+(1-(t-low)/(high-low))*plot;
    return {span,temps,w,height,top,base:top+plot,rainBottom:top+plot+gap+rain,x,y};
  }
  // Hora mais perto de uma posição horizontal do gráfico (unidades do viewBox), para mostrar a leitura
  // dela ao passar o dedo ou o mouse. Só horas com temperatura: hora sem leitura não vira valor inventado.
  function chartPoint(reading,position) {
    const s=scale(reading);
    if(!s || !Number.isFinite(position)) return null;
    const hour=s.temps.reduce((best,h)=>Math.abs(s.x(h.stamp)-position)<Math.abs(s.x(best.stamp)-position) ? h : best);
    return {hour,x:Math.round(s.x(hour.stamp)*10)/10,y:Math.round(s.y(hour.temperature)*10)/10,top:s.top,bottom:s.rainBottom,width:s.w};
  }
  function chart(reading,{now=null,label=h=>String(h).padStart(2,'0')+'h'}={}) {
    const s=scale(reading);
    if(!s) return '';
    const {span,temps,w,height,top,x,y}=s,{plot,rain,gap,left,right}=CHART,r=v=>Math.round(v*10)/10;
    // Segmentos contínuos (passo de uma hora); cada um vira uma curva suave (Catmull-Rom em Bézier).
    const segments=[];
    for(const h of temps){const last=segments.at(-1);if(last && h.stamp-last.at(-1).stamp<=3600000) last.push(h);else segments.push([h]);}
    const smooth=points=>points.map((p,i)=>{
      if(!i) return `M${r(p[0])} ${r(p[1])}`;
      const a=points[i-2]||points[i-1],b=points[i-1],c=p,d=points[i+1]||p;
      return `C${r(b[0]+(c[0]-a[0])/6)} ${r(b[1]+(c[1]-a[1])/6)} ${r(c[0]-(d[0]-b[0])/6)} ${r(c[1]-(d[1]-b[1])/6)} ${r(c[0])} ${r(c[1])}`;
    }).join('');
    const base=s.base,lines=[],areas=[];
    for(const segment of segments){
      const points=segment.map(h=>[x(h.stamp),y(h.temperature)]);
      if(points.length===1) points.push([points[0][0]+1,points[0][1]]);
      const line=smooth(points);lines.push(line);
      areas.push(`${line}L${r(points.at(-1)[0])} ${base}L${r(points[0][0])} ${base}Z`);
    }
    const hi=temps.reduce((a,b)=>b.temperature>a.temperature?b:a),lo=temps.reduce((a,b)=>b.temperature<a.temperature?b:a);
    const fmt=t=>Math.round(t)+'°';
    const mark=(h,cls,dy)=>{const cx=r(x(h.stamp)),cy=r(y(h.temperature)),anchor=cx<24?'start':cx>w-24?'end':'middle';
      return `<circle class="day-chart-dot ${cls}" cx="${cx}" cy="${cy}" r="3.5"/><text class="day-chart-mark" x="${cx}" y="${r(cy+dy)}" text-anchor="${anchor}">${fmt(h.temperature)}</text>`;};
    let nowMark='';
    if(Number.isFinite(now) && now>=reading.start && now<reading.end){
      const nx=r(x(now));
      const before=temps.filter(h=>h.stamp<=now).at(-1),after=temps.find(h=>h.stamp>now);
      const t=before && after && after.stamp-before.stamp<=3600000 ? before.temperature+(after.temperature-before.temperature)*(now-before.stamp)/(after.stamp-before.stamp) : null;
      nowMark=`<line class="day-chart-now" x1="${nx}" x2="${nx}" y1="${top-6}" y2="${base+gap+rain}"/>`+(t===null?'':`<circle class="day-chart-now-dot" cx="${nx}" cy="${r(y(t))}" r="4.5"/>`)+`<text class="day-chart-axis day-chart-now-label" x="${nx}" y="${top-10}" text-anchor="${nx<24?'start':nx>w-24?'end':'middle'}">Agora</text>`;
    }
    const wet=(reading.hours||[]).filter(h=>typeof h.mm==='number' && Number.isFinite(h.mm) && h.mm>=.1);
    const slot=(w-left-right)/(span/3600000),rainTop=base+gap;
    const bars=wet.map(h=>{const fill=Math.min(1,Math.sqrt(h.mm/10)),bh=Math.max(2,r(fill*rain));
      return `<rect class="day-chart-rain" x="${r(x(h.stamp)+1)}" y="${r(rainTop+rain-bh)}" width="${r(Math.max(1.5,slot-2))}" height="${bh}" rx="1.5"/>`;}).join('');
    const ticks=[0,6,12,18,24].map(hh=>{const tx=r(left+hh/24*(w-left-right));return `<line class="day-chart-grid" x1="${tx}" x2="${tx}" y1="${top}" y2="${base}"/>`+(hh<24?`<text class="day-chart-axis" x="${tx}" y="${height-4}" text-anchor="${hh?'middle':'start'}">${label(hh)}</text>`:'');}).join('');
    const id='dayChart'+String(reading.date||'').replace(/\D/g,'');
    return `<svg class="day-chart-svg" viewBox="0 0 ${w} ${height}" focusable="false" aria-hidden="true"><defs>`+
      `<linearGradient id="${id}Line" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${base}"><stop offset="0" stop-color="var(--day-chart-hot)"/><stop offset=".55" stop-color="var(--day-chart-mild)"/><stop offset="1" stop-color="var(--day-chart-cold)"/></linearGradient>`+
      `<linearGradient id="${id}Fill" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${base}"><stop offset="0" stop-color="var(--day-chart-hot)" stop-opacity=".32"/><stop offset="1" stop-color="var(--day-chart-cold)" stop-opacity="0"/></linearGradient></defs>`+
      ticks+`<line class="day-chart-base" x1="${left}" x2="${w-right}" y1="${base}" y2="${base}"/>`+
      areas.map(d=>`<path class="day-chart-area" d="${d}" fill="url(#${id}Fill)"/>`).join('')+
      lines.map(d=>`<path class="day-chart-line" d="${d}" pathLength="1" stroke="url(#${id}Line)"/>`).join('')+
      (wet.length?`<line class="day-chart-base" x1="${left}" x2="${w-right}" y1="${rainTop+rain}" y2="${rainTop+rain}"/>${bars}`:`<text class="day-chart-axis day-chart-dry" x="${w/2}" y="${rainTop+rain-8}" text-anchor="middle">${reading.complete?'Sem chuva prevista':'Sem chuva nos horários disponíveis'}</text>`)+
      mark(hi,'is-high',-9)+(hi===lo?'':mark(lo,'is-low',16))+nowMark+`</svg>`;
  }
  function mount(root) {
    const doc=root.document,el=id=>doc.getElementById(id),dialog=el('dailyDetailDialog');
    if(!dialog) return;
    let state=null,selectedDate=null,opener=null;
    const unit=(value,suffix,digits=0)=>value===null ? 'Indisponível' : format(value,digits)+suffix;
    const stamp=value=>Number.isFinite(value) ? (time?.dateFormat || Intl.DateTimeFormat)('pt-BR',{timeZone:state.city.timezone,hour:'2-digit',minute:'2-digit'}).format(value) : 'Indisponível';
    function available() {
      const today=time.dayKey(state.at||Date.now(),state.city);
      return (state.daily.time||[]).map((date,index)=>({date,index})).filter(r=>r.date>=today).slice(0,7);
    }
    function paint() {
      const index=state?.daily.time.indexOf(selectedDate),reading=state && detail(state.daily,state.hourly,index,state.city);
      if(!reading || !available().some(day=>day.date===selectedDate)) {if(dialog.open) dialog.close();return false;}
      const date=new Date(reading.date+'T12:00:00Z');
      el('dailyDetailTitle').textContent=(time?.dateFormat || Intl.DateTimeFormat)('pt-BR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(date);
      el('dailyDetailCity').textContent=state.city.name+'/'+state.city.uf;
      el('dailyDetailCondition').textContent=reading.code===null ? 'Condição indisponível' : root.PLUVIA.weatherIcons.condition(reading.code).label;
      const figure=el('dailyDetailChart');
      // Só troca o SVG quando o desenho muda: a atualização da mesma previsão não refaz a animação do traço.
      if(figure) {const markup=chart(reading,{now:time.dayKey(Date.now(),state.city)===reading.date ? Date.now() : null});if(figure.pluviaChart!==markup){figure.innerHTML=markup;figure.pluviaChart=markup;scrubEnd();}figure.hidden=!markup;figure.pluviaReading=reading;}
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
      // Fonte da leitura real (desde a 1.9.1 a previsão normal é só do Open-Meteo; o MET entra só na reduzida).
      const weather=root.PLUVIA?.weatherData?.get?.(state.city.id)?.source?.weather;
      const source=weather==='met-norway' ? 'MET Norway' : weather==='met-norway+open-meteo' ? 'MET Norway / Open-Meteo' : 'Open-Meteo';
      el('dailyDetailSource').textContent=(state.fromCache ? 'Dados salvos · ' : weather==='met-norway' ? 'Previsão reduzida · ' : 'Previsão por modelos · ')+`${source} · horário de ${state.city.name}.`;
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
      // O botão que tinha o foco pode ter ficado desabilitado (último/primeiro dia): o foco iria para o body.
      if(dialog.open && (doc.activeElement===doc.body || doc.activeElement?.disabled)) (el('dailyDetailNext').disabled ? el('dailyDetailPrev') : el('dailyDetailNext'))?.focus?.({preventScroll:true});
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
      root.PLUVIA?.fadeText?.(Array.from(dialog.querySelectorAll('h2, .dialog-scroll :is(dd, #dailyDetailCondition, .daily-hour strong)')),280);
    }
    // Passar o dedo (ou o mouse) no gráfico mostra a hora, a temperatura e a chuva daquele horário, como no
    // app Tempo. Uma linha, uma bolinha e um rótulo dentro do próprio SVG, reaproveitados a cada movimento
    // (só atributos e texto; nada de transform/opacity em blocos). touch-action:pan-y deixa a rolagem
    // vertical da janela com o navegador: ela cancela o toque e o rótulo some.
    const figure=el('dailyDetailChart'),svgNS='http://www.w3.org/2000/svg';
    let scrub=null;
    function scrubEnd() {scrub?.group.remove();scrub=null;figure?.removeAttribute('data-scrubbing');}
    function scrubAt(event) {
      const svg=figure.querySelector('svg'),reading=figure.pluviaReading;
      if(!svg || !reading || !state) return;
      const box=svg.getBoundingClientRect(),view=svg.viewBox.baseVal;
      if(!box.width || !view?.width) return;
      const point=chartPoint(reading,(event.clientX-box.left)/box.width*view.width);
      if(!point) return scrubEnd();
      if(!scrub || !scrub.group.isConnected) {
        const make=(tag,cls)=>{const node=doc.createElementNS(svgNS,tag);node.setAttribute('class',cls);return node;};
        const group=make('g','day-chart-scrub'),line=make('line','day-chart-scrub-line'),dot=make('circle','day-chart-scrub-dot'),text=make('text','day-chart-scrub-label');
        dot.setAttribute('r','5');group.append(line,dot,text);svg.append(group);scrub={group,line,dot,text,stamp:null};
      }
      figure.setAttribute('data-scrubbing','');
      if(scrub.stamp===point.hour.stamp) return;
      scrub.stamp=point.hour.stamp;
      const {line,dot,text}=scrub,hour=point.hour;
      for(const [k,v] of [['x1',point.x],['x2',point.x],['y1',point.top-6],['y2',point.bottom]]) line.setAttribute(k,v);
      dot.setAttribute('cx',point.x);dot.setAttribute('cy',point.y);
      const rain=typeof hour.mm==='number' && hour.mm>=.1 ? ' · '+format(hour.mm,1)+' mm' : '';
      text.textContent=`${stamp(hour.stamp)} · ${Math.round(hour.temperature)}°${rain}`;
      text.setAttribute('x',point.x);text.setAttribute('y',point.top-10);
      text.setAttribute('text-anchor',point.x<70 ? 'start' : point.x>point.width-70 ? 'end' : 'middle');
    }
    if(figure) {
      figure.addEventListener('pointerdown',scrubAt);
      figure.addEventListener('pointermove',event=>{if(event.pointerType==='mouse' || event.buttons || event.pressure>0) scrubAt(event);});
      for(const type of ['pointerup','pointercancel','pointerleave']) figure.addEventListener(type,scrubEnd);
      dialog.addEventListener('close',scrubEnd);
    }
    el('dailyDetailPrev').addEventListener('click',()=>move(-1));el('dailyDetailNext').addEventListener('click',()=>move(1));
    root.addEventListener('pluvia:city-changed',()=>{if(dialog.open) dialog.close();state=null;selectedDate=null;});
    root.addEventListener('pluvia:forecast-spread',event=>{if(dialog.open && state?.city.id===event.detail?.cityId) paint();});
    root.PLUVIA.dailyDetail.update=update;
  }
  return {detail,chart,chartPoint,mount};
});
