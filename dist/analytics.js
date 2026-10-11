(() => {
  'use strict';
  // Public, write-only project token; never use a personal/secret API key here.
  const PROJECT_TOKEN = "phc_yxT3ZC8brv4uP5EngDqbsvr4uMi8NacXJTZXGcTiX3bk";
  const ENDPOINT = 'https://us.i.posthog.com/batch/?ip=0';
  const CHOICE_KEY = 'pluvia-analytics-consent-v1';
  const release = 'vitals-1';
  const events = new Set(['PLUVIA Opened','City Search Opened','City Searched','City Selected','Favorite City Toggled','Weather Map Viewed','Alert Opened','Official Alert Link Opened','Location Requested','Location Authorized','Location Denied','Location Unavailable','Account Dialog Opened','Auth Mode Selected','Auth Started','Auth Completed','Signup Confirmation Requested','Profile Name Saved','Push Permission Result','Push Enabled','Push Disabled','Push Test Accepted','Push Preferences Saved','App Failure','Web Vital','Compare Opened','Compare City Changed','Brazil Now Opened','Brazil Capital Chosen','Favorite Suggested','Favorite Suggestion Accepted','Favorite Suggestion Dismissed','Alert Nudge Shown','Alert Nudge Tapped','Alert Nudge Dismissed','Rain Report Sent','Install Prompt Shown','Install Prompt Tapped','Install Prompt Dismissed','App Installed']);
  const values = {
    mode:new Set(['login','signup']),offer:new Set(['install','enable']),source:new Set(['welcome','topbar','INMET','location','picker_or_saved','picker','automatic','notice','city_picker','swipe','dots','search','favorite','saved_place','brazil','startup','other','home']),
    reason:new Set(['unsupported','permission','timeout','position','catalog']),permission:new Set(['granted','denied','default']),
    layer:new Set(['rain','clouds','lightning']),platform:new Set(['ios','android','desktop','other']),
    component:new Set(['application','asset','weather','air-quality','alerts','met-norway','ensemble','account','radar','lightning']),
    error_code:new Set(['timeout','network_error','invalid_response','rate_limited','provider_unavailable','http_error','client_unavailable','unexpected','resource_error']),
    error_type:new Set(['Error','TypeError','ReferenceError','SyntaxError','RangeError','RequestError']),
    kind:new Set(['dry','drizzle','rain','heavy']),metric:new Set(['LCP','INP','CLS','FCP','TTFB']),rating:new Set(['good','needs-improvement','poor'])
  };
  let consent = false, timer = null, inFlight = null, controller = null, generation = 0, visitId = null, sent = 0;
  const queue = [], failures = new Set();
  try {consent=localStorage.getItem(CHOICE_KEY)==='1';} catch {}
  const protectedBrowser = () => navigator.globalPrivacyControl===true || [navigator.doNotTrack,window.doNotTrack].some(value=>value==='1' || value==='yes');
  const configured = () => PROJECT_TOKEN.startsWith('phc_') && ['pluviaweather.com.br','luccamottaa.github.io'].includes(location.hostname);
  const enabled = () => configured() && consent && !protectedBrowser();
  function sanitize(properties) {
    const safe={};
    for(const [key,value] of Object.entries(properties || {})) {
      if(values[key]?.has(value))safe[key]=value;
      else if(key==='standalone' && typeof value==='boolean')safe[key]=value;
      else if(key==='query_length' && Number.isInteger(value) && value>=2 && value<=200)safe[key]=value;
      else if(key==='status' && Number.isInteger(value) && value>=400 && value<=599)safe[key]=value;
      else if(key==='metric_value' && Number.isInteger(value) && value>=0 && value<=120000)safe[key]=value;
    }
    return safe;
  }
  function id() {
    if(!visitId) {
      if(window.crypto?.randomUUID)visitId='pluvia-'+window.crypto.randomUUID();
      else if(window.crypto?.getRandomValues)visitId='pluvia-'+Array.from(window.crypto.getRandomValues(new Uint8Array(16)),value=>value.toString(16).padStart(2,'0')).join('');
    }
    return visitId;
  }
  function clear() {
    generation++;clearTimeout(timer);timer=null;queue.length=0;visitId=null;sent=0;failures.clear();controller?.abort();
  }
  function paintChoice() {
    const input=document.getElementById('analyticsConsent'),status=document.getElementById('analyticsChoiceStatus');
    if(input){input.checked=consent && !protectedBrowser();input.disabled=protectedBrowser();}
    if(status)status.textContent=protectedBrowser() ? 'Seu navegador pede privacidade; a coleta está desativada.' : consent ? 'Participação ativada neste dispositivo. Você pode desativar a qualquer momento.' : 'Desativado. A previsão funciona sem compartilhar métricas.';
  }
  // Aberto pelo ícone da Tela de Início: no iPhone é o que permite receber avisos.
  const installed = () => window.matchMedia?.('(display-mode: standalone)').matches===true || navigator.standalone===true;
  function setConsent(value) {
    clear();consent=value===true && !protectedBrowser();
    try{localStorage.setItem(CHOICE_KEY,consent ? '1' : '0');}catch{}
    paintChoice();if(enabled())track('PLUVIA Opened',{standalone:installed()});
  }
  function track(name,properties={}) {
    if(!enabled() || !events.has(name) || sent>=100 || queue.length>=50 || !id())return;
    sent++;
    const agent=navigator.userAgent || '',browser=/Firefox/i.test(agent) ? 'firefox' : /Chrome|Chromium|CriOS|Edg/i.test(agent) ? 'chromium' : /Safari/i.test(agent) ? 'safari' : 'other';
    queue.push({event:name,distinct_id:visitId,timestamp:new Date().toISOString(),properties:{...sanitize(properties),app:'PLUVIA',environment:'production',release,browser,$process_person_profile:false,$geoip_disable:true,$ip:null}});
    if(timer===null)timer=setTimeout(()=>{timer=null;flush();},2000);
  }
  function flush() {
    if(inFlight)return inFlight;
    clearTimeout(timer);timer=null;
    if(!enabled()){clear();return Promise.resolve(false);}
    if(!queue.length || navigator.onLine===false)return Promise.resolve(false);
    const batch=queue.splice(0,20),revision=generation,requestController=new AbortController();
    controller=requestController;
    const timeout=setTimeout(()=>requestController.abort(),5000);
    // Delivery is best effort: no retry loop, storage of events, or blocking UI.
    const task=Promise.resolve().then(()=>revision!==generation || !enabled() ? {ok:false} : window.fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:PROJECT_TOKEN,batch}),credentials:'omit',referrerPolicy:'no-referrer',keepalive:true,signal:requestController.signal})).then(response=>response.ok).catch(()=>false).finally(()=>{
      clearTimeout(timeout);
      if(inFlight===task){inFlight=null;controller=null;}
      if(revision===generation && enabled() && queue.length && timer===null)timer=setTimeout(()=>{timer=null;flush();},2000);
    });
    inFlight=task;return task;
  }
  function reportFailure(properties) {
    if(properties?.error_code==='cancelled')return;
    const safe=sanitize(properties);
    if(!enabled() || failures.size>=10)return;
    const key=JSON.stringify(safe);if(failures.has(key))return;failures.add(key);track('App Failure',safe);
  }
  // Core Web Vitals measured with the browser's own observers (no SDK). Only the metric name,
  // rating and a bounded integer are sent, once per metric and page, when the page is hidden.
  const vitals={},reportedVitals=new Set(),interactions=new Map();
  const VITAL_LIMITS={LCP:[2500,4000],INP:[200,500],CLS:[100,250],FCP:[1800,3000],TTFB:[800,1800]};
  function observe(type,fn,options={}) {
    try{new PerformanceObserver(list=>list.getEntries().forEach(fn)).observe({type,buffered:true,...options});}catch{}
  }
  function setupVitals() {
    if(typeof PerformanceObserver!=='function')return;
    observe('paint',entry=>{if(entry.name==='first-contentful-paint')vitals.FCP=entry.startTime;});
    observe('largest-contentful-paint',entry=>{vitals.LCP=entry.startTime;});
    let session=0,sessionStart=0,sessionLast=0;
    observe('layout-shift',entry=>{
      if(entry.hadRecentInput)return;
      if(session && entry.startTime-sessionLast<1000 && entry.startTime-sessionStart<5000)session+=entry.value;
      else{session=entry.value;sessionStart=entry.startTime;}
      sessionLast=entry.startTime;vitals.CLS=Math.max(vitals.CLS||0,session);
    });
    const onInteraction=entry=>{
      if(!entry.interactionId || (!interactions.has(entry.interactionId) && interactions.size>=500))return;
      interactions.set(entry.interactionId,Math.max(interactions.get(entry.interactionId)||0,entry.duration));
      const durations=[...interactions.values()].sort((a,b)=>b-a);
      vitals.INP=durations[Math.min(durations.length-1,Math.floor(durations.length/50))];
    };
    observe('event',onInteraction,{durationThreshold:40});observe('first-input',onInteraction);
    try{const navigation=performance.getEntriesByType('navigation')[0];if(navigation?.responseStart>0)vitals.TTFB=navigation.responseStart;}catch{}
  }
  function reportVitals() {
    if(!enabled())return;
    for(const [metric,raw] of Object.entries(vitals)) {
      if(reportedVitals.has(metric) || !Number.isFinite(raw) || raw<0)continue;
      const value=Math.round(metric==='CLS' ? raw*1000 : raw),[good,poor]=VITAL_LIMITS[metric];
      if(value>120000)continue;
      reportedVitals.add(metric);
      track('Web Vital',{metric,rating:value<=good ? 'good' : value<=poor ? 'needs-improvement' : 'poor',metric_value:value});
    }
  }
  setupVitals();
  // Existing account callers remain compatible without linking Auth identities.
  window.pluviaAnalytics={track,identify(){},resetUser:clear,enabled,sanitize,setConsent,flush,reportFailure,reportVitals};
  window.addEventListener('online',()=>flush());
  window.addEventListener('pagehide',()=>{reportVitals();flush();});
  window.addEventListener('storage',event=>{if(event.key===CHOICE_KEY){clear();consent=event.newValue==='1';paintChoice();}});
  window.addEventListener('error',event=>{
    if(event.target?.tagName==='SCRIPT' || event.target?.tagName==='LINK')reportFailure({component:'asset',error_code:'resource_error'});
    else reportFailure({component:'application',error_code:'unexpected',error_type:event.error?.name});
  },true);
  window.addEventListener('unhandledrejection',event=>{if(event.reason?.code!=='cancelled')reportFailure({component:'application',error_code:values.error_code.has(event.reason?.code) ? event.reason.code : 'unexpected',error_type:event.reason?.name});});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){reportVitals();flush();}});
  document.addEventListener('DOMContentLoaded',()=>{
    const on=(id,event,fn)=>document.getElementById(id)?.addEventListener(event,fn);
    paintChoice();on('analyticsConsent','change',event=>setConsent(event.target.checked));
    on('openPrivacy','click',()=>{document.getElementById('openSources')?.click();document.getElementById('analyticsConsent')?.focus();});
    track('PLUVIA Opened',{standalone:installed()});
    on('welcomeSearch','click',()=>track('City Search Opened',{source:'welcome'}));
    on('openCitySearch','click',()=>track('City Search Opened',{source:'topbar'}));
    on('favoriteCity','click',()=>track('Favorite City Toggled'));
    on('accountButton','click',()=>track('Account Dialog Opened'));
    on('compareOpen','click',()=>track('Compare Opened',{source:'city_picker'}));
    on('homeCompare','click',()=>track('Compare Opened',{source:'home'}));
    on('compareCity','change',()=>track('Compare City Changed'));
    on('brazilOpen','click',()=>track('Brazil Now Opened',{source:'city_picker'}));
    on('homeBrazil','click',()=>track('Brazil Now Opened',{source:'home'}));
    on('accountLogin','click',()=>track('Auth Mode Selected',{mode:'login'}));
    on('accountSignup','click',()=>track('Auth Mode Selected',{mode:'signup'}));
    let searchTimer;
    on('citySearch','input',event=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>track('City Searched',{query_length:event.target.value.trim().length}),500);});
    document.addEventListener('click',event=>{
      if(event.target.closest?.('[data-notice]'))track('Alert Opened',{source:'INMET'});
      if(event.target.closest?.('a[href*="avisos.inmet.gov.br"]'))track('Official Alert Link Opened',{source:'INMET'});
      if(event.target.closest?.('#brazilDialog [data-city-id]'))track('Brazil Capital Chosen');
    });
  });
})();
