(() => {
  'use strict';
  const API_KEY = 'AMPLITUDE_API_KEY';
  const SDK_URL = 'https://cdn.amplitude.com/script/AMPLITUDE_API_KEY.js';
  let readyPromise = null;
  const queue = [];
  const enabled = () => API_KEY !== 'AMPLITUDE_API_KEY' && API_KEY.length > 10;
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
    const safe={...properties,app:'PLUVIA',path:location.pathname};
    if(window.amplitude?.track) window.amplitude.track(name,safe); else { queue.push([name,safe]); load(); }
  }
  function identify(userId){ if(enabled()&&userId) load().then(ok=>{if(ok&&window.amplitude?.setUserId)window.amplitude.setUserId(userId);}); }
  function resetUser(){ if(enabled()) load().then(ok=>{if(ok&&window.amplitude?.reset)window.amplitude.reset();}); }
  window.pluviaAnalytics={track,identify,resetUser,enabled};

  document.addEventListener('DOMContentLoaded',()=>{
    const on=(id,event,fn)=>document.getElementById(id)?.addEventListener(event,fn);
    on('welcomeLocate','click',()=>track('Location Requested',{source:'welcome'}));
    on('locateCity','click',()=>track('Location Requested',{source:'city_picker'}));
    on('welcomeSearch','click',()=>track('City Search Opened',{source:'welcome'}));
    on('openCitySearch','click',()=>track('City Search Opened',{source:'topbar'}));
    on('favoriteCity','click',()=>track('Favorite City Toggled',{city:document.getElementById('cityName')?.textContent||null}));
    on('rainMapLoad','click',()=>track('Rain Map Opened',{city:document.getElementById('cityName')?.textContent||null}));
    on('rainPulseToggle','click',()=>track('Rain Animation Toggled',{city:document.getElementById('cityName')?.textContent||null}));
    on('accountButton','click',()=>track('Account Dialog Opened'));
    on('accountLogin','click',()=>track('Auth Mode Selected',{mode:'login'}));
    on('accountSignup','click',()=>track('Auth Mode Selected',{mode:'signup'}));
    document.getElementById('accountForm')?.addEventListener('submit',()=>track('Auth Submitted',{mode:document.getElementById('accountNameField')?.hidden?'login':'signup'}),true);
    document.querySelector('#inmetCard .source-link')?.addEventListener('click',()=>track('Official Alert Link Opened',{source:'INMET'}));
    document.querySelector('#defesaCard .source-link')?.addEventListener('click',()=>track('Civil Defense Signup Opened'));

    const cityLabel=document.getElementById('selectedCityLabel');
    if(cityLabel){ let previous=cityLabel.textContent; new MutationObserver(()=>{const next=cityLabel.textContent;if(next&&next!==previous&&next!=='Cidade'){previous=next;track('City Selected',{city_label:next});}}).observe(cityLabel,{childList:true,subtree:true,characterData:true}); }
  });
  load();
})();
