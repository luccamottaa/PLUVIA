(() => {
  'use strict';

  const API_KEY = 'AMPLITUDE_API_KEY';
  const SDK_URL = 'https://cdn.amplitude.com/script/AMPLITUDE_API_KEY.js';
  let readyPromise = null;
  const queue = [];

  function enabled() {
    return API_KEY !== 'AMPLITUDE_API_KEY' && API_KEY.length > 10;
  }

  function load() {
    if (!enabled()) return Promise.resolve(false);
    if (readyPromise) return readyPromise;
    readyPromise = new Promise(resolve => {
      const script = document.createElement('script');
      script.async = true;
      script.src = SDK_URL.replace('AMPLITUDE_API_KEY', encodeURIComponent(API_KEY));
      script.onload = () => {
        try {
          window.amplitude.init(API_KEY, undefined, {
            defaultTracking: { sessions: true, pageViews: true, formInteractions: false, fileDownloads: false },
            trackingOptions: { ipAddress: false }
          });
          while (queue.length) {
            const [name, props] = queue.shift();
            window.amplitude.track(name, props);
          }
          resolve(true);
        } catch (_) { resolve(false); }
      };
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
    return readyPromise;
  }

  function track(name, properties = {}) {
    if (!enabled()) return;
    const safe = { ...properties, app: 'PLUVIA', path: location.pathname };
    if (window.amplitude?.track) window.amplitude.track(name, safe);
    else { queue.push([name, safe]); load(); }
  }

  function identify(userId) {
    if (!enabled() || !userId) return;
    load().then(ok => { if (ok && window.amplitude?.setUserId) window.amplitude.setUserId(userId); });
  }

  function resetUser() {
    if (!enabled()) return;
    load().then(ok => { if (ok && window.amplitude?.reset) window.amplitude.reset(); });
  }

  window.pluviaAnalytics = { track, identify, resetUser, enabled };
  load();
})();
