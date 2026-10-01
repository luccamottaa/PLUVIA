// Group related forecast signals while keeping each official notice independent.
export function eventGroup(event) {
  const type = event.type || event.event_type;
  if (['rain_approaching','heavy_rain','storm'].includes(type)) return 'rain';
  if (type==='weather_change' && event.metadata?.rain_transition && !event.metadata?.wind_transition && Math.abs(event.metadata?.temperature_delta_c || 0)<6) return 'rain';
  return type;
}
export function selectCandidates(candidates) {
  const picked=new Map(), independent=[];
  const rank={storm:3,heavy_rain:2,rain_approaching:1};
  for(const candidate of candidates) {
    if(['official_alert','daily_summary'].includes(candidate.type)) {independent.push(candidate);continue;}
    const group=eventGroup(candidate), previous=picked.get(group);
    if(!previous || candidate.severity>previous.severity || candidate.severity===previous.severity && (rank[candidate.type] || 0)>(rank[previous.type] || 0)) picked.set(group,candidate);
  }
  return [...independent,...picked.values()].sort((a,b)=>b.severity-a.severity);
}
export function isRepeat(candidate,deliveries,now=Date.now()) {
  if(['official_alert','daily_summary'].includes(candidate.type)) return false;
  return deliveries.some(delivery=>{
    const prior=delivery.notification_events;
    if(!prior || prior.city_id!==candidate.cityId || eventGroup(prior)!==eventGroup(candidate) || prior.severity<candidate.severity) return false;
    const at=Date.parse(delivery.sent_at || delivery.created_at);
    const age=now-at;
    return age>=0 && (delivery.status==='accepted' && age<6*3600000 || delivery.status==='pending' && age<120000);
  });
}
