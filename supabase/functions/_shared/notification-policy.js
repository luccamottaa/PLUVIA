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
    if(candidate.type==='official_alert' && candidates.some(other=>other!==candidate && other.type==='official_alert' && covers(other,candidate,true))) continue;
    if(['official_alert','daily_summary','evening_summary'].includes(candidate.type)) {independent.push(candidate);continue;}
    const group=eventGroup(candidate), previous=picked.get(group);
    if(!previous || candidate.severity>previous.severity || candidate.severity===previous.severity && (rank[candidate.type] || 0)>(rank[previous.type] || 0)) picked.set(group,candidate);
  }
  return [...independent,...picked.values()].sort((a,b)=>b.severity-a.severity);
}
// "Parou de chover" só faz sentido para quem soube que começou: exige um rain_now/storm_now aceito para o
// aparelho nas últimas 6 h (a consulta de deliver já filtra cidade e janela) e nenhum "parou" depois dele.
// Pancada curta não vira par "começou"/"parou" (outubro/2026, Rio: o aeroporto relatava chuva fraca num boletim
// e seco no seguinte, e o mesmo aparelho recebia os dois com 5 a 25 min de diferença): o "parou" só sai uma hora
// depois do "começou", e só por uma leitura posterior à que disse que começou (às 23:20 a estação mediu 1,6 mm
// das 22 às 23 e às 23:45 saiu "parou" pelo boletim das 23:00 do aeroporto). Com o seco continuando, o boletim
// seguinte refaz o aviso e ele sai.
export function stopAllowed(deliveries,{now=Date.now(),observedAt=null}={}) {
  const at=delivery=>Date.parse(delivery.sent_at || delivery.created_at);
  const accepted=deliveries.filter(delivery=>delivery.status==='accepted' && delivery.notification_events);
  const starts=accepted.filter(d=>['rain_now','storm_now'].includes(d.notification_events.event_type));
  const started=Math.max(-Infinity,...starts.map(at));
  const stopped=Math.max(-Infinity,...deliveries.filter(d=>d.notification_events?.event_type==='rain_stopped' && ['accepted','pending'].includes(d.status)).map(at));
  if(!Number.isFinite(started) || stopped>=started || now-started<3600000) return false;
  const last=starts.find(d=>at(d)===started), from=Date.parse(last?.notification_events?.metadata?.observed_at), to=Date.parse(observedAt);
  return !(Number.isFinite(from) && Number.isFinite(to) && to<=from);
}
export function isRepeat(candidate,deliveries,now=Date.now()) {
  if(['official_alert','daily_summary','evening_summary'].includes(candidate.type)) return false;
  return deliveries.some(delivery=>{
    const prior=delivery.notification_events;
    // "Chuva chegando" (radar) já avisou esta chuva: o "chuva nas próximas horas" do modelo que sobra no lote
    // quando o radar para de falar (faltam < 10 min) seria o segundo aviso do mesmo episódio.
    const related=eventGroup(prior)===eventGroup(candidate) || candidate.type==='rain_approaching' && prior.event_type==='rain_incoming';
    if(!prior || prior.city_id!==candidate.cityId || !related || prior.severity<candidate.severity) return false;
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

// Reinstalar o app no iPhone cria outra inscrição e a antiga continua entregando no mesmo aparelho (19/10/2026:
// o mesmo aviso do INMET chegou duas vezes). Por usuário, no mesmo serviço de push, sistema e navegador, vale a
// inscrição mais nova; uma mais antiga só continua se foi vista depois que a nova apareceu (outro aparelho em uso,
// como um iPad). Não desliga nada: só escolhe quem recebe nesta rodada.
export function activeSubscriptions(list=[]) {
  const key=item=>[String(item.endpoint||'').split('/')[2]||'',item.platform||'',item.browser||''].join('|');
  const newest=new Map();
  for(const item of list) {
    const group=key(item), created=Date.parse(item.created_at)||0, current=newest.get(group);
    if(!current || created>current.created) newest.set(group,{id:item.id,created});
  }
  return list.filter(item=>{
    const current=newest.get(key(item));
    if(current.id===item.id) return true;
    const seen=Date.parse(item.last_seen_at);
    return Number.isFinite(seen) && seen>=current.created;
  });
}

// Um aviso oficial "cobre" outro do mesmo fenômeno quando tem grau igual ou maior e vale pelo menos de antes do
// começo até depois do fim do outro. strict (mesmo lote): com o mesmo grau, só o de período maior cobre.
function covers(wide,narrow,strict=false) {
  const time=(event,key)=>{const value=event[key] ?? event.metadata?.[key==='start'?'valid_from':'valid_until'];return Date.parse(value instanceof Date?value.toISOString():value);};
  const wideSeverity=Number(wide.severity), narrowSeverity=Number(narrow.severity);
  if(wide.title!==narrow.title || wideSeverity<narrowSeverity) return false;
  const ws=time(wide,'start'), we=time(wide,'expires'), ns=time(narrow,'start'), ne=time(narrow,'expires');
  if(![ws,we,ns,ne].every(Number.isFinite) || ws>ns || we<ne) return false;
  return !strict || wideSeverity>narrowSeverity || we-ws>ne-ns;
}
// O INMET às vezes republica o mesmo aviso com outro número (19/10/2026, Manaus: 11:43 e 11:51, mesmo fenômeno,
// grau e fim). Para o mesmo aparelho e cidade, um aviso oficial com o mesmo título, grau e fim de um já entregue é
// repetição; grau maior ou fim diferente (aviso novo ou prorrogado) passa. Também é repetição o aviso que um já
// entregue cobre (24/10/2026, Rio: às 08:10 chegou "Perigo" para o dia 25 inteiro e às 23:00 chegaram "Perigo" para
// a manhã do dia 25 e "Perigo potencial" para o dia 25, os dois dentro do primeiro).
export function isOfficialRepeat(event,recent=[]) {
  const until=event.metadata?.valid_until;
  if(!until) return false;
  return recent.some(row=>{
    const previous=row?.notification_events || {};
    if(previous.event_type!=='official_alert') return false;
    if(Number(previous.severity)===Number(event.severity) && previous.title===event.title && previous.metadata?.valid_until===until) return true;
    return covers({title:previous.title,severity:previous.severity,start:previous.started_at ?? previous.metadata?.valid_from,expires:previous.metadata?.valid_until},{title:event.title,severity:event.severity,start:event.start ?? event.metadata?.valid_from,expires:until});
  });
}
