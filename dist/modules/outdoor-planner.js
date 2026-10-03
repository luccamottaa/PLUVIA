(function(root,factory) {
  const node=typeof module==='object' && module.exports;
  const api=factory(node ? require('./city-time.js') : root.PLUVIA?.time,
    node ? require('./hourly-detail.js') : root.PLUVIA?.hourlyDetail);
  if(node) module.exports=api;
  root.PLUVIA=root.PLUVIA || {};root.PLUVIA.outdoorPlanner=api;
})(globalThis,function(time,details) {
  'use strict';
  const HOUR=3600000,MAX_AGE=90*60000;
  // A conservative comparison of modelled, two-hour daylight windows, not a safety assessment.
  function build({hourly,city,dayAt,now=Date.now(),weatherAt,fromCache=false,officialWarning=false}={}) {
    const unavailable=reason=>({kind:'unavailable',reason});
    if(officialWarning) return unavailable('official_warning');
    if(fromCache || !Number.isFinite(weatherAt) || now-weatherAt<0 || now-weatherAt>MAX_AGE) return unavailable('stale');
    if(!city?.timezone || !Array.isArray(hourly?.time) || !details?.detail || typeof dayAt!=='function') return unavailable('missing');
    let best=null,complete=0;
    for(let i=0;i<Math.min(hourly.time.length-2,168);i++) {
      const start=time.parse(hourly.time[i],city),middle=time.parse(hourly.time[i+1],city),end=time.parse(hourly.time[i+2],city);
      if(!Number.isFinite(start) || start<now || end>now+24*HOUR || middle-start!==HOUR || end-middle!==HOUR) continue;
      const solar=dayAt(start);
      if(!solar || start<solar.rise || end>solar.set || !Number.isFinite(solar.rise) || !Number.isFinite(solar.set)) continue;
      const readings=[i,i+1,i+2].map(index=>details.detail(hourly,index));
      if(readings.some(r=>!r || r.feelsLike===null || r.wind===null || r.code===null) ||
        readings.slice(0,2).some(r=>r.mm===null || r.probability===null)) continue;
      complete++;
      const feels=readings.map(r=>r.feelsLike),wind=Math.max(...readings.map(r=>r.wind));
      const probability=Math.max(...readings.slice(0,2).map(r=>r.probability));
      const mm=readings.slice(0,2).reduce((sum,r)=>sum+r.mm,0);
      const gusts=readings.map(r=>r.gust),uvs=readings.map(r=>r.uv);
      const gust=gusts.every(Number.isFinite) ? Math.max(...gusts) : null;
      const uv=uvs.every(Number.isFinite) ? Math.max(...uvs) : null;
      // Missing optional samples never become zero, and known adverse samples still veto a window.
      if(Math.min(...feels)<10 || Math.max(...feels)>34 || probability>=60 || mm>=1 || wind>=30 ||
        gusts.some(value=>value!==null && value>=50) || uvs.some(value=>value!==null && value>=8) ||
        readings.some(r=>![0,1,2,3].includes(r.code))) continue;
      const score=Math.max(...feels.map(value=>Math.abs(value-23)))+probability*.25+mm*8+
        Math.max(0,wind-10)*.2+(uv===null ? 3 : Math.max(0,uv-2)*1.5)+(gust===null ? 2 : 0);
      if(!best || score<best.score) best={kind:'window',start,end,index:i,score,
        feelsMin:Math.min(...feels),feelsMax:Math.max(...feels),probability,mm,wind,gust,uv};
    }
    return best || unavailable(complete ? 'conditions' : 'missing');
  }
  function copy(result,city,now=Date.now()) {
    const messages={official_warning:'Há aviso oficial vigente. Confira a área e as orientações antes de planejar sair.',
      stale:'Atualize a previsão para comparar os próximos horários.',
      missing:'Ainda faltam dados para comparar uma faixa de duas horas com luz do dia.',
      conditions:'Nenhuma faixa de duas horas reúne condições favoráveis nos dados disponíveis.'};
    if(result?.kind!=='window') return {title:'Sem sugestão de horário agora',text:messages[result?.reason] || messages.missing,note:'Comparação das próximas 24h · previsão por modelos'};
    const format=new Intl.DateTimeFormat('pt-BR',{timeZone:city.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const when=time.dayKey(result.start,city)===time.dayKey(now,city) ? 'Hoje' : 'Amanhã';
    const feels=result.feelsMin===result.feelsMax ? Math.round(result.feelsMin)+'°' : Math.round(result.feelsMin)+'–'+Math.round(result.feelsMax)+'°';
    const optional=[result.uv===null ? 'UV incompleto' : 'UV até '+Math.round(result.uv),result.gust===null ? 'rajadas incompletas' : 'rajadas até '+Math.round(result.gust)+' km/h'];
    return {title:`${when}, ${format.format(result.start)}–${format.format(result.end)}`,
      text:`Sensação ${feels} · chance de chuva até ${Math.round(result.probability)}% · vento até ${Math.round(result.wind)} km/h.`,
      note:`Faixa comparativamente mais favorável com luz do dia · ${optional.join(' · ')}. A previsão pode mudar; confira avisos e proteção solar.`};
  }
  return {build,copy};
});
