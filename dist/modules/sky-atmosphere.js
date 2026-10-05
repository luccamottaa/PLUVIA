(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./city-time.js') : root.PLUVIA?.time);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.PLUVIA = root.PLUVIA || {};
    root.PLUVIA.sky = api.create({document:root.document, sun:root.PLUVIA.sun, moon:root.PLUVIA.moon, moonView:root.PLUVIA.moonView});
    let storage;
    try { storage = root.localStorage; } catch (_) {}
    root.PLUVIA.sky.bootstrap(storage);
    const startMotion = () => { root.PLUVIA.skyMotion = api.observeMotion(root.document,root.IntersectionObserver); };
    if (root.document?.readyState === 'loading') root.document.addEventListener?.('DOMContentLoaded',startMotion,{once:true});
    else startMotion();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (time) {
  'use strict';
  const WINDOW_MS = 30 * 60000;
  const CELESTIAL_FADE_MS = 15 * 60000;
  const STAR_FADE_MS = 45 * 60000;
  const DAY_MS = 24 * 3600000;
  const CLOCK_STEP_MS = 60000;
  const ORBIT_MARGIN = .12;
  const CACHE_AGE_MS = 36 * 3600000;
  const DEFAULT_CITY = {id:'1302603',lat:-3.119,lon:-60.022,timezone:'America/Manaus'};

  function weatherType(code) {
    if ([0].includes(code)) return 'sun';
    if ([1,2].includes(code)) return 'partly';
    if (code === 3) return 'cloud';
    if ([45,48].includes(code)) return 'fog';
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return 'rain';
    if ([71,73,75,77,85,86].includes(code)) return 'snow';
    if ([95,96,99].includes(code)) return 'storm';
    return 'unknown';
  }
  // Decorative profiles from WMO categories, never an observed rain rate.
  // Thunderstorm codes do not specify an amount: use the moderate visual profile.
  const RAIN_PROFILES = {
    none:{kind:'none',opacity:0,backOpacity:0,speed:2.2,backSpeed:4.3,width:380,backWidth:640},
    drizzle:{kind:'drizzle',opacity:.16,backOpacity:.3,speed:2.8,backSpeed:5.2,width:520,backWidth:600},
    light:{kind:'light',opacity:.35,backOpacity:.4,speed:2.2,backSpeed:4.3,width:380,backWidth:640},
    moderate:{kind:'moderate',opacity:.58,backOpacity:.5,speed:1.6,backSpeed:3.2,width:300,backWidth:480},
    heavy:{kind:'heavy',opacity:.76,backOpacity:.62,speed:1.05,backSpeed:2.4,width:220,backWidth:360}
  };
  function rainProfile(code) {
    if ([51,53,55,56,57].includes(code)) return RAIN_PROFILES.drizzle;
    if ([61,66,80].includes(code)) return RAIN_PROFILES.light;
    if ([63,81,95,96,99].includes(code)) return RAIN_PROFILES.moderate;
    if ([65,67,82].includes(code)) return RAIN_PROFILES.heavy;
    return RAIN_PROFILES.none;
  }
  function localDate(now, timezone) {
    return time?.dayKey(now,timezone);
  }
  function cityTime(value, city) {
    return time?.parse(value,city) ?? NaN;
  }
  function create({document, sun = null, moon = null, moonView = null, now = () => Date.now()} = {}) {
    let city = null, rows = [], weather = 'unknown', providerPhase = 'unknown', code = null;
    let lastUpdate = null;
    const calculatedDays = new Map(), moonDays = new Map();
    function calculatedDay(at) {
      if(!Number.isFinite(at) || !city?.timezone || !Number.isFinite(city.lat) || !Number.isFinite(city.lon) || Math.abs(city.lat)>90 || Math.abs(city.lon)>180) return null;
      try {
        const date=localDate(at,city.timezone);
        if(!calculatedDays.has(date)) {
          const next=new Date(date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);
          const start=cityTime(date+'T00:00:00',city),end=cityTime(next.toISOString().slice(0,10)+'T00:00:00',city);
          if(!Number.isFinite(start) || !Number.isFinite(end) || end<=start) return null;
          const result=sun?.getTimes(new Date(cityTime(date+'T12:00:00',city)),city.lat,city.lon) || {};
          const stamp=value=>Number.isFinite(value?.getTime?.()) ? value.getTime() : null;
          calculatedDays.set(date,{date,start,end,rise:stamp(result.sunrise),set:stamp(result.sunset),dawn:stamp(result.dawn),dusk:stamp(result.dusk),nauticalDawn:stamp(result.nauticalDawn),nauticalDusk:stamp(result.nauticalDusk)});
          if(calculatedDays.size>3) calculatedDays.delete(calculatedDays.keys().next().value);
        }
        return calculatedDays.get(date);
      } catch (_) {return null;}
    }
    function dayAt(at) {
      // Forecast first; before it arrives or after an offline date change,
      // use the selected city's coordinates instead of yesterday's is_day.
      const forecast = rows.find(row => at >= row.start && at < row.end);
      if (forecast) return forecast;
      const calculated=calculatedDay(at);
      return calculated && Number.isFinite(calculated.rise) && Number.isFinite(calculated.set) && calculated.set>calculated.rise ?
        {rise:calculated.rise,set:calculated.set,start:calculated.start,end:calculated.end} : null;
    }
    function astronomyAt(at = now()) {
      const day=calculatedDay(at);
      if(!day) return null;
      if(!moonDays.has(day.date)) {
        let rise=null,set=null,available=Boolean(moon?.getMoonTimes);
        try {
          // SunCalc scans UTC days. Assemble every UTC day intersecting the municipal
          // calendar day, then filter events by local bounds (including 23/25-hour DST days).
          if(available) for(let stamp=Math.floor(day.start/DAY_MS)*DAY_MS;stamp<day.end;stamp+=DAY_MS) {
            const events=moon.getMoonTimes(new Date(stamp),city.lat,city.lon);
            if(!events || !['rise','set'].some(key=>Number.isFinite(events[key]?.getTime?.())) && typeof events.alwaysUp!=='boolean' && typeof events.alwaysDown!=='boolean') available=false;
            for(const key of ['rise','set']) {
              const value=events?.[key]?.getTime?.();
              if(Number.isFinite(value) && value>=day.start && value<day.end) {
                if(key==='rise') rise=rise===null ? value : Math.min(rise,value);
                else set=set===null ? value : Math.min(set,value);
              }
            }
          }
        } catch (_) {available=false;}
        moonDays.set(day.date,{moonRise:available ? rise : null,moonSet:available ? set : null,moonAvailable:available});
        if(moonDays.size>3) moonDays.delete(moonDays.keys().next().value);
      }
      return {...dayAt(at),date:day.date,dawn:day.dawn,dusk:day.dusk,...moonDays.get(day.date)};
    }
    function write(state, animate) {
      const rain = rainProfile(code);
      for (const node of [document?.documentElement,document?.body].filter(Boolean)) {
        Object.assign(node.dataset,{phase:state.phase,solar:state.solar,weather,clouds:state.clouds,rain:rain.kind,skyTransition:animate ? 'live' : 'instant'});
        node.style?.setProperty('--twilight-opacity',state.strength.toFixed(3));
        node.style?.setProperty('--sun-visibility',state.sunVisibility.toFixed(3));
        node.style?.setProperty('--moon-visibility',state.moonVisibility.toFixed(3));
        node.style?.setProperty('--stars-visibility',state.starVisibility.toFixed(3));
        node.style?.setProperty('--sun-orbit-x',state.sunX.toFixed(6));
        node.style?.setProperty('--sun-orbit-y',state.sunY.toFixed(6));
        node.style?.setProperty('--moon-orbit-x',state.moonX.toFixed(6));
        node.style?.setProperty('--moon-orbit-y',state.moonY.toFixed(6));
        node.style?.setProperty('--rain-opacity',String(rain.opacity));
        node.style?.setProperty('--rain-back-opacity',String(rain.backOpacity));
        node.style?.setProperty('--rain-speed',`${rain.speed}s`);
        node.style?.setProperty('--rain-back-speed',`${rain.backSpeed}s`);
        node.style?.setProperty('--rain-width',`${rain.width}px`);
        node.style?.setProperty('--rain-back-width',`${rain.backWidth}px`);
      }
      return state;
    }
    function update(at = now(), allowMotion = true) {
      const animate = allowMotion && Number.isFinite(lastUpdate) && at > lastUpdate && at - lastUpdate <= CLOCK_STEP_MS;
      lastUpdate = Number.isFinite(at) ? at : null;
      let phase = providerPhase, solar = 'none', strength = 0, progress = 0;
      const today = dayAt(at);
      if (today) {
        phase = at >= today.rise && at < today.set ? 'day' : 'night';
        for (const [name,time] of [['sunrise',today.rise],['sunset',today.set]]) {
          if (Math.abs(at - time) < WINDOW_MS) {
            solar = name;
            progress = (at - time + WINDOW_MS) / (2 * WINDOW_MS);
            strength = Math.sin(Math.PI * progress);
            break;
          }
        }
      }
      const clamp = value => Math.max(0,Math.min(1,value));
      let sunVisibility = phase === 'day' ? 1 : 0;
      let moonVisibility = phase === 'night' ? 1 : 0;
      let dayProgress = .5, nightProgress = .5;
      let starVisibility = Number.isFinite(at) && phase === 'night' && ['sun','partly'].includes(weather) ? 1 : 0;
      if (today) {
        // The disk belongs only to its side of the solar clock. Twilight
        // colors may linger after sunset, but they never bring the sun back.
        sunVisibility = phase === 'day' ? clamp(Math.min(at - today.rise,today.set - at) / CELESTIAL_FADE_MS) : 0;
        moonVisibility = phase === 'night' ? clamp((at < today.rise ? today.rise - at : at - today.set) / CELESTIAL_FADE_MS) : 0;
        dayProgress = clamp((at - today.rise) / (today.set - today.rise));
        const nightStart = at < today.rise ? dayAt(today.start - 1)?.set ?? today.set - DAY_MS : today.set;
        const nightEnd = at < today.rise ? today.rise : dayAt(today.end)?.rise ?? today.rise + DAY_MS;
        nightProgress = clamp((at - nightStart) / (nightEnd - nightStart));
        if (starVisibility) {
          // Fade using the same cached solar ephemeris, never time since opening.
          // Forecast rise/set remain the phase boundary; nautical twilight supplies
          // the dark end when valid, with a bounded visual fallback if unavailable.
          const calculated = calculatedDay(at);
          const boundary = at < today.rise ? calculated?.nauticalDawn : calculated?.nauticalDusk;
          const fade = Number.isFinite(boundary) ? (at < today.rise ? today.rise - boundary : boundary - today.set) : NaN;
          const duration = Number.isFinite(fade) && fade >= CELESTIAL_FADE_MS && fade <= 3 * 3600000 ? fade : STAR_FADE_MS;
          const darkness = clamp((at < today.rise ? today.rise - at : at - today.set) / duration);
          starVisibility = darkness * darkness * (3 - 2 * darkness);
        }
      }
      if (weather === 'partly') starVisibility *= .48;
      // The background Moon illustrates the municipal night, as the Sun does
      // the day. Real moonrise/set remain in astronomyAt; phase stays shared.
      const moonX = ORBIT_MARGIN + nightProgress * (1 - 2 * ORBIT_MARGIN);
      const moonY = 1 - Math.sin(Math.PI * nightProgress);
      moonView?.update(at);
      // WMO 1 (mainly clear) shares the partly-cloudy palette, but needs fewer
      // cloud banks than WMO 2. Coverage is decorative, never an observation.
      return write({phase,solar,weather,clouds:code === 1 ? 'few' : 'standard',strength,sunVisibility,moonVisibility,starVisibility,
        sunX:ORBIT_MARGIN + dayProgress * (1 - 2 * ORBIT_MARGIN),sunY:1 - Math.sin(Math.PI * dayProgress),
        moonX,moonY},animate);
    }
    function apply(nextCode, isDay, daily = null, nextCity = city, at = now()) {
      city = nextCity; code = nextCode; weather = weatherType(code);
      providerPhase = isDay === 1 ? 'day' : isDay === 0 ? 'night' : 'unknown';
      calculatedDays.clear();
      moonDays.clear();
      rows = (Array.isArray(daily?.sunrise) ? daily.sunrise : []).map((rise,i) => {
        if (typeof rise !== 'string') return {};
        // Offsets can differ between local midnights across DST.
        const suffix = city?.timezone ? '' : rise.match(/(?:Z|[+-]\d{2}:?\d{2})$/i)?.[0] || '';
        const next = new Date(rise.slice(0,10) + 'T12:00:00Z');
        if (!Number.isFinite(next.getTime())) return {};
        next.setUTCDate(next.getUTCDate() + 1);
        return {rise:cityTime(rise,city),set:cityTime(daily.sunset?.[i],city),
          start:cityTime(rise.slice(0,10) + 'T00:00:00' + suffix,city),
          end:cityTime(next.toISOString().slice(0,10) + 'T00:00:00' + suffix,city)};
      }).filter(row => Object.values(row).length === 4 && Object.values(row).every(Number.isFinite) && row.set > row.rise && row.end > row.start);
      return update(at,false);
    }
    function bootstrap(storage, at = now()) {
      let saved = null, selected = DEFAULT_CITY;
      try {
        const id = JSON.parse(storage?.getItem('pluvia-city') || 'null');
        const record = JSON.parse(storage?.getItem('pluvia-city-record') || 'null');
        if (record?.id === id && Number.isFinite(record.lat) && Number.isFinite(record.lon) && Math.abs(record.lat) <= 90 && Math.abs(record.lon) <= 180 && record.timezone) {
          if (localDate(at,record.timezone)) selected = record;
        }
        const cached = JSON.parse(storage?.getItem(`pluvia-weather-${selected.id}`) || 'null');
        if (cached && at - cached.at >= 0 && at - cached.at <= CACHE_AGE_MS) saved = cached.data?.forecast;
      } catch (_) { /* Storage may be blocked; the reference city still has a solar clock. */ }
      return apply(saved?.current?.weather_code,saved?.current?.is_day,saved?.daily,selected,at);
    }
    return {apply,update,bootstrap,dayAt,astronomyAt};
  }
  function observeMotion(document, Observer) {
    const scene = document?.querySelector?.('.sky-effects');
    const intro = document?.getElementById?.('pluviaIntro');
    const opening = intro?.querySelector?.('.intro-sky');
    let inView = true;
    function sync() {
      const introVisible = intro && !intro.hidden && !intro.classList.contains('is-leaving');
      if (scene) scene.dataset.motion = !document.hidden && inView && !introVisible ? 'running' : 'paused';
      if (opening) opening.dataset.motion = !document.hidden && introVisible ? 'running' : 'paused';
    }
    // No scroll handler or per-frame JavaScript. Offscreen/hidden scenes stop
    // while native scrolling and CSS transforms keep their own timing.
    if (scene && Observer) {
      const observer = new Observer(entries => {
        inView = entries.some(entry => entry.target === scene && entry.isIntersecting);
        sync();
      });
      observer.observe(scene);
    }
    document?.addEventListener?.('visibilitychange',sync);
    sync();
    return {sync};
  }
  return {create,weatherType,cityTime,observeMotion};
});
