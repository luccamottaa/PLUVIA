(() => {
  'use strict';
  const API_KEY = 'AMPLITUDE_API_KEY';
  const SDK_URL = 'https://cdn.amplitude.com/script/AMPLITUDE_API_KEY.js';
  let readyPromise = null;
  const queue = [];
  const blockedProperty = /(?:e-?mail|password|senha|token|latitude|longitude|coordinates?|coords?)/i;
  const enabled = () => API_KEY !== 'AMPLITUDE_API_KEY' && API_KEY.length > 10;
  function sanitize(properties) {
    return Object.fromEntries(Object.entries(properties || {}).flatMap(([key,value]) => {
      if (blockedProperty.test(key) || !['string','number','boolean'].includes(typeof value)) return [];
      return [[key,typeof value === 'string' ? value.slice(0,80) : value]];
    }));
  }
  function load() {
    if (!enabled()) return Promise.resolve(false);
    if (readyPromise) return readyPromise;
    readyPromise = new Promise(resolve => {
      const script = document.createElement('script'); script.async = true;
      script.src = SDK_URL.replace('AMPLITUDE_API_KEY', encodeURIComponent(API_KEY));
      script.onload = () => { try {
        window.amplitude.init(API_KEY, undefined, {defaultTracking:{sessions:true,pageViews:true,formInteractions:false,fileDownloads:false},trackingOptions:{ipAddress:false}});
        while(queue.length){ const [n,p]=queue.shift(); window.amplitude.track(n,p); }
        resolve(true);
      } catch(_){ resolve(false); } };
      script.onerror = () => resolve(false); document.head.appendChild(script);
    });
    return readyPromise;
  }
  function track(name, properties={}) {
    if (!enabled()) return;
    const safe={...sanitize(properties),app:'PLUVIA',path:location.pathname};
    if(window.amplitude?.track) window.amplitude.track(name,safe); else if(queue.length < 50) { queue.push([name,safe]); load(); }
  }
  function identify(userId){ if(enabled()&&userId) load().then(ok=>{if(ok&&window.amplitude?.setUserId)window.amplitude.setUserId(userId);}); }
  function resetUser(){ if(enabled()) load().then(ok=>{if(ok&&window.amplitude?.reset)window.amplitude.reset();}); }
  window.pluviaAnalytics={track,identify,resetUser,enabled,sanitize};

  document.addEventListener('DOMContentLoaded',()=>{
    const on=(id,event,fn)=>document.getElementById(id)?.addEventListener(event,fn);
    track('PLUVIA Opened');
    on('welcomeSearch','click',()=>track('City Search Opened',{source:'welcome'}));
    on('openCitySearch','click',()=>track('City Search Opened',{source:'topbar'}));
    on('favoriteCity','click',()=>track('Favorite City Toggled',{city:document.getElementById('cityName')?.textContent||null}));
    on('rainMapLoad','click',()=>track('Rain Map Opened',{city:document.getElementById('cityName')?.textContent||null}));
    on('rainPulseToggle','click',()=>track('Rain Animation Toggled',{city:document.getElementById('cityName')?.textContent||null}));
    on('accountButton','click',()=>track('Account Dialog Opened'));
    on('accountLogin','click',()=>track('Auth Mode Selected',{mode:'login'}));
    on('accountSignup','click',()=>track('Auth Mode Selected',{mode:'signup'}));
    document.querySelector('#inmetCard .source-link')?.addEventListener('click',()=>track('Official Alert Link Opened',{source:'INMET'}));
    document.querySelector('#defesaCard .source-link')?.addEventListener('click',()=>track('Civil Defense Signup Opened'));
    let searchTimer;
    on('citySearch','input',event=>{ clearTimeout(searchTimer); searchTimer=setTimeout(()=>{
      const length=event.target.value.trim().length;
      if(length >= 2) track('City Searched',{query_length:length});
    },500); });
    document.addEventListener('click',event=>{
      if(event.target.closest?.('[data-notice]')) track('Alert Opened',{source:'INMET'});
      if(event.target.closest?.('a[href*="avisos.inmet.gov.br"]')) track('Official Alert Link Opened',{source:'INMET'});
    });
  });
  load();
})();
