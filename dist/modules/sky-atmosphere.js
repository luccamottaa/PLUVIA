(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.PLUVIA = root.PLUVIA || {};
    root.PLUVIA.sky = api.create({document:root.document, sun:root.PLUVIA.sun, moonView:root.PLUVIA.moonView});
    let storage;
    try { storage = root.localStorage; } catch (_) {}
    root.PLUVIA.sky.bootstrap(storage);
    const startMotion = () => { root.PLUVIA.skyMotion = api.observeMotion(root.document,root.IntersectionObserver); };
    if (root.document?.readyState === 'loading') root.document.addEventListener?.('DOMContentLoaded',startMotion,{once:true});
    else startMotion();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const WINDOW_MS = 30 * 60000;
  const CELESTIAL_FADE_MS = 15 * 60000;
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
  function localDate(now, timezone) {
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
    const value = key => parts.find(part => part.type === key).value;
    return `${value('year')}-${value('month')}-${value('day')}`;
  }
  function cityTime(value, city) {
    if (typeof value !== 'string') return NaN;
    if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) return Date.parse(value);
    if (!city?.timezone || !Number.isFinite(Date.parse(value + 'Z'))) return NaN;
    const offset = new Intl.DateTimeFormat('en',{timeZone:city.timezone,timeZoneName:'longOffset'}).formatToParts(new Date(value + 'Z')).find(part => part.type === 'timeZoneName').value;
    return Date.parse(value + (offset === 'GMT' ? 'Z' : offset.replace('GMT','')));
  }
  function create({document, sun = null, moonView = null, now = () => Date.now()} = {}) {
    let city = null, rows = [], weather = 'unknown', providerPhase = 'unknown', code = null;
    let lastUpdate = null;
    const calculatedDays = new Map();
    function dayAt(at) {
      // Forecast first; before it arrives or after an offline date change,
      // use the selected city's coordinates instead of yesterday's is_day.
      const forecast = rows.find(row => at >= row.start && at < row.end);
      if (forecast) return forecast;
      if (!Number.isFinite(at) || !city?.timezone || !sun || !Number.isFinite(city.lat) || !Number.isFinite(city.lon)) return null;
      // Cache a few adjacent local days so the night crosses midnight (and
      // daylight-saving changes) using the actual next sunrise.
      try {
        const date = localDate(at,city.timezone);
        if (!calculatedDays.has(date)) {
          const next = new Date(date + 'T12:00:00Z');
          next.setUTCDate(next.getUTCDate() + 1);
          const result = sun.getTimes(new Date(cityTime(date + 'T12:00:00',city)),city.lat,city.lon);
          const times = {rise:result.sunrise?.getTime(),set:result.sunset?.getTime(),
            start:cityTime(date + 'T00:00:00',city),end:cityTime(next.toISOString().slice(0,10) + 'T00:00:00',city)};
          calculatedDays.set(date,Object.values(times).every(Number.isFinite) && times.set > times.rise ? times : null);
          if (calculatedDays.size > 3) calculatedDays.delete(calculatedDays.keys().next().value);
        }
        return calculatedDays.get(date);
      } catch (_) { return null; }
    }
    function write(state, animate) {
      for (const node of [document?.documentElement,document?.body].filter(Boolean)) {
        Object.assign(node.dataset,{phase:state.phase,solar:state.solar,weather,skyTransition:animate ? 'live' : 'instant'});
        node.style?.setProperty('--twilight-opacity',state.strength.toFixed(3));
        node.style?.setProperty('--sun-visibility',state.sunVisibility.toFixed(3));
        node.style?.setProperty('--moon-visibility',state.moonVisibility.toFixed(3));
        node.style?.setProperty('--sun-orbit-x',state.sunX.toFixed(6));
        node.style?.setProperty('--sun-orbit-y',state.sunY.toFixed(6));
        node.style?.setProperty('--moon-orbit-x',state.moonX.toFixed(6));
        node.style?.setProperty('--moon-orbit-y',state.moonY.toFixed(6));
        node.style?.setProperty('--rain-opacity',weather === 'storm' ? '.85' : [65,67,82].includes(code) ? '.8' : '.6');
        node.style?.setProperty('--rain-speed',weather === 'storm' || [65,67,82].includes(code) ? '1s' : '1.6s');
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
      if (today) {
        // The disk belongs only to its side of the solar clock. Twilight
        // colors may linger after sunset, but they never bring the sun back.
        sunVisibility = phase === 'day' ? clamp(Math.min(at - today.rise,today.set - at) / CELESTIAL_FADE_MS) : 0;
        moonVisibility = phase === 'night' ? clamp((at < today.rise ? today.rise - at : at - today.set) / CELESTIAL_FADE_MS) : 0;
        dayProgress = clamp((at - today.rise) / (today.set - today.rise));
        const nightStart = at < today.rise ? dayAt(today.start - 1)?.set ?? today.set - DAY_MS : today.set;
        const nightEnd = at < today.rise ? today.rise : dayAt(today.end)?.rise ?? today.rise + DAY_MS;
        nightProgress = clamp((at - nightStart) / (nightEnd - nightStart));
      }
      // A full-width decorative arc: sunrise on the left, noon at the top,
      // sunset on the right. The Moon follows the sunset-to-sunrise interval;
      // this is a night illustration, not an astronomical moonrise plot.
      moonView?.update(at);
      return write({phase,solar,weather,strength,sunVisibility,moonVisibility,
        sunX:ORBIT_MARGIN + dayProgress * (1 - 2 * ORBIT_MARGIN),sunY:1 - Math.sin(Math.PI * dayProgress),
        moonX:ORBIT_MARGIN + nightProgress * (1 - 2 * ORBIT_MARGIN),moonY:1 - Math.sin(Math.PI * nightProgress)},animate);
    }
    function apply(nextCode, isDay, daily = null, nextCity = city, at = now()) {
      city = nextCity; code = nextCode; weather = weatherType(code);
      providerPhase = isDay === 1 ? 'day' : isDay === 0 ? 'night' : 'unknown';
      calculatedDays.clear();
      rows = (Array.isArray(daily?.sunrise) ? daily.sunrise : []).map((rise,i) => {
        if (typeof rise !== 'string') return {};
        const suffix = rise.match(/(?:Z|[+-]\d{2}:?\d{2})$/i)?.[0] || '';
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
          localDate(at,record.timezone); selected = record;
        }
        const cached = JSON.parse(storage?.getItem(`pluvia-weather-${selected.id}`) || 'null');
        if (cached && at - cached.at >= 0 && at - cached.at <= CACHE_AGE_MS) saved = cached.data?.forecast;
      } catch (_) { /* Storage may be blocked; the reference city still has a solar clock. */ }
      return apply(saved?.current?.weather_code,saved?.current?.is_day,saved?.daily,selected,at);
    }
    return {apply,update,bootstrap};
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
