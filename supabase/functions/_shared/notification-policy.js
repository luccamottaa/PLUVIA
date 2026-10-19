// Group related forecast signals while keeping each official notice independent.
export function eventGroup(event) {
  const type = event.type || event.event_type;
  if (['rain_approaching','heavy_rain','storm'].includes(type)) return 'rain';
  // Observados ficam fora do grupo da previsão: "começou a chover" não é repetição de "chuva nas próximas
  // horas", e "chuva por perto" não impede o aviso de quando ela chega.
  if (['rain_now','storm_now'].includes(type)) return 'observed';
  if (type==='rain_nearby') return 'nearby';
  if (type==='weather_change' && event.metadata?.rain_transition && !event.metadata?.wind_transition && Math.abs(event.metadata?.temperature_delta_c || 0)<6) return 'rain';
  return type;
}
// Já chovendo (estação ou aeroporto mediu/relatou agora), "chuva nas próximas horas" não informa nada e
// "parou de chover" seria contraditório: os dois saem do lote. Chuva forte e tempestade previstas continuam, porque ainda podem piorar o que já cai.
export function selectCandidates(candidates,{raining=false}={}) {
  const picked=new Map(), independent=[];
  const rank={storm:3,heavy_rain:2,rain_approaching:1,storm_now:3,rain_now:2,rain_nearby:1};
  const wet=raining || candidates.some(candidate=>['rain_now','storm_now'].includes(candidate.type));
  const incoming=!wet && candidates.some(candidate=>candidate.type==='rain_incoming');
  for(const candidate of candidates) {
    if(wet && ['rain_approaching','rain_stopped','rain_incoming'].includes(candidate.type)) continue;
    // Radar com a chuva chegando diz o mesmo que "chuva nas próximas horas", com hora mais precisa.
    if(incoming && candidate.type==='rain_approaching') continue;
    if(['official_alert','daily_summary','evening_summary'].includes(candidate.type)) {independent.push(candidate);continue;}
    const group=eventGroup(candidate), previous=picked.get(group);
    if(!previous || candidate.severity>previous.severity || candidate.severity===previous.severity && (rank[candidate.type] || 0)>(rank[previous.type] || 0)) picked.set(group,candidate);
  }
  return [...independent,...picked.values()].sort((a,b)=>b.severity-a.severity);
}
// "Parou de chover" só faz sentido para quem soube que começou: exige um rain_now/storm_now aceito para o
// aparelho nas últimas 6 h (a consulta de deliver já filtra cidade e janela) e nenhum "parou" depois dele.
export function stopAllowed(deliveries) {
  const at=delivery=>Date.parse(delivery.sent_at || delivery.created_at);
  const accepted=deliveries.filter(delivery=>delivery.status==='accepted' && delivery.notification_events);
  const started=Math.max(-Infinity,...accepted.filter(d=>['rain_now','storm_now'].includes(d.notification_events.event_type)).map(at));
  const stopped=Math.max(-Infinity,...deliveries.filter(d=>d.notification_events?.event_type==='rain_stopped' && ['accepted','pending'].includes(d.status)).map(at));
  return Number.isFinite(started) && stopped < started;
}
export function isRepeat(candidate,deliveries,now=Date.now()) {
  if(['official_alert','daily_summary','evening_summary'].includes(candidate.type)) return false;
  return deliveries.some(delivery=>{
    const prior=delivery.notification_events;
    if(!prior || prior.city_id!==candidate.cityId || eventGroup(prior)!==eventGroup(candidate) || prior.severity<candidate.severity) return false;
    const at=Date.parse(delivery.sent_at || delivery.created_at);
    const age=now-at;
    return age>=0 && (delivery.status==='accepted' && age<6*3600000 || delivery.status==='pending' && age<120000);
  });
}
// Prioridade de entrega (cabeçalho Urgency do Web Push). Na Apple, "normal" pode ser segurado ou agrupado
// pelo aparelho (economia de bateria, Resumo Programado); o resumo marcado pela pessoa e a chuva que
// acabou de começar perdem o sentido se chegarem depois. Uma vez por dia ou por episódio: o custo de
// bateria é desprezível. A mudança no tempo e o resto da previsão de baixa severidade continuam normais.
export function pushUrgency(type,severity) {
  if(severity>=3 || ['daily_summary','evening_summary','rain_now','storm_now','rain_nearby','rain_stopped','rain_incoming'].includes(type)) return 'high';
  return 'normal';
}
