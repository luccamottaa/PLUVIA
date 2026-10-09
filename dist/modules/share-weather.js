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
    const stamp=(time?.dateFormat || Intl.DateTimeFormat)('pt-BR',{timeZone:city.timezone,day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(at));
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
    let snapshot=null,busy=false,revision=0,card=null,cardUrl=null,cardToken=0;
    if(typeof activeCity!=='undefined') snapshot=root.PLUVIA?.weatherData?.get(activeCity?.id);
    button.disabled=!build(snapshot);
    const status=text=>{el('shareWeatherStatus').textContent=text;};
    const conditionLabel=()=>root.PLUVIA?.weatherIcons?.condition(snapshot?.current?.weatherCode)?.label;
    // Imagem do story pronta antes do toque: o Safari só aceita navigator.share logo após o gesto,
    // então o PNG é gerado quando a previsão chega (em ocioso) e descartado na troca de cidade.
    function prepareCard() {
      const token=++cardToken,cards=root.PLUVIA?.shareCard;card=null;
      if(!cards || !snapshot || typeof root.File!=='function') return;
      const night=root.document.body?.dataset?.phase==='night';
      const data=cards.model(snapshot,{condition:conditionLabel(),night});
      if(!data) return;
      const idle=root.requestIdleCallback ? fn=>root.requestIdleCallback(fn,{timeout:2000}) : fn=>root.setTimeout(fn,300);
      // Fora da abertura: espera o primeiro toque/rolagem/tecla (ou 6 s), para o canvas não disputar a CPU
      // com a primeira pintura. Ainda fica pronto antes do toque em Compartilhar na prática.
      // Modo seguro (depois de uma queda): o story só é desenhado após o primeiro toque, sem o timer de 6 s.
      const safe=root.document?.documentElement?.hasAttribute?.('data-safe');
      const schedule=fn=>engaged ? idle(fn) : (pendingCard=()=>idle(fn), safe || root.setTimeout(engage,6000));
      schedule(()=>cards.render(data,{document:root.document}).then(blob=>{
        if(token!==cardToken || !blob) return;
        const name=String(snapshot?.location?.name || 'cidade').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
        card=new root.File([blob],`pluvia-${name || 'previsao'}.png`,{type:'image/png'});
      }).catch(()=>{}));
    }
    let engaged=false,pendingCard=null;
    function engage() { engaged=true; const run=pendingCard; pendingCard=null; run?.(); }
    for(const type of ['pointerdown','keydown','scroll','touchstart']) root.addEventListener?.(type,engage,{once:true,passive:true,capture:true});
    function clearCardPreview() {
      if(cardUrl) {root.URL?.revokeObjectURL?.(cardUrl);cardUrl=null;}
      const image=el('shareWeatherImage'),link=el('shareWeatherDownload');
      if(image) {image.hidden=true;image.removeAttribute?.('src');}
      if(link) {link.hidden=true;link.removeAttribute?.('href');}
    }
    root.addEventListener('pluvia:weather-updated',event=>{
      snapshot=root.PLUVIA?.weatherData?.get(event.detail?.cityId);button.disabled=!build(snapshot);status('');prepareCard();
    });
    root.addEventListener('pluvia:city-changed',()=>{
      revision++;cardToken++;snapshot=null;card=null;button.disabled=true;status('');if(dialog.open) dialog.close();
    });
    button.addEventListener('click',async()=>{
      if(busy) return;
      let payload=build(snapshot,conditionLabel());
      if(!payload) {status('Sem leitura recente para compartilhar. Atualize a previsão.');return;}
      // Com suporte a arquivos (iPhone/Android), a imagem vai junto do texto; sem suporte, só o texto.
      try { if(card && root.navigator?.canShare?.({files:[card]})) payload={...payload,files:[card]}; } catch {}
      const selected=revision,image=card;busy=true;button.disabled=true;
      try {
        const result=await deliver(payload,root.navigator);
        if(selected!==revision) return;
        if(result==='manual') {
          clearCardPreview();
          if(image && el('shareWeatherImage') && root.URL?.createObjectURL) {
            cardUrl=root.URL.createObjectURL(image);
            el('shareWeatherImage').src=cardUrl;el('shareWeatherImage').hidden=false;
            el('shareWeatherDownload').href=cardUrl;el('shareWeatherDownload').download=image.name;el('shareWeatherDownload').hidden=false;
          }
          el('shareWeatherText').value=payload.text+'\n'+payload.url;dialog.showModal();el('shareWeatherText').focus();el('shareWeatherText').select();
        } else status(result==='copied' ? 'Previsão copiada.' : result==='shared' ? 'Previsão compartilhada.' : '');
      } finally {busy=false;button.disabled=!build(snapshot);}
    });
    el('shareWeatherClose').addEventListener('click',()=>globalThis.PLUVIA?.dialogs?.close(dialog) ?? dialog.close());
    dialog.addEventListener('click',event=>{if(event.target===dialog) globalThis.PLUVIA?.dialogs?.close(dialog) ?? dialog.close();});
    dialog.addEventListener('close',()=>{clearCardPreview();if(!button.disabled) button.focus({preventScroll:true});});
    if(snapshot) prepareCard();
  }
  return {build,deliver,mount};
});
