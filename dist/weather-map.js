(function () {
  const $ = id => document.getElementById(id);
  const dialog = $('weatherMapDialog');
  const openButton = $('openWeatherMap');
  if (!dialog || !openButton) return;

  const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  const RAIN_META = 'https://api.rainviewer.com/public/weather-maps.json';
  const GIBS_ROOT = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
  const state = { map:null, base:null, overlay:null, marker:null, layer:'rain', frames:[], index:0, timer:null, controller:null, cityId:null };
  let leafletPromise;

  function source(id, patch) { globalThis.PLUVIA?.sources?.set(id, {...patch, checkedAt:Date.now()}); }
  function setError(message) { $('weatherMapError').hidden = !message; $('weatherMapError').textContent = message || ''; }
  function city() { return typeof activeCity !== 'undefined' ? activeCity : null; }
  function zoneTime(unix) {
    const value = new Date(unix * 1000);
    return new Intl.DateTimeFormat('pt-BR',{timeZone:city()?.timezone || 'UTC',hour:'2-digit',minute:'2-digit'}).format(value);
  }
  function dateLabel(value) {
    const date = new Date(value + 'T12:00:00Z');
    return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',timeZone:'UTC'}).format(date).replace('.','');
  }
  function utcDate(offset) {
    const date = new Date(Date.now() + offset * 86400000);
    return date.toISOString().slice(0,10);
  }
  function loadLeaflet() {
    if (globalThis.L) return Promise.resolve(globalThis.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve,reject) => {
      if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
        const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = LEAFLET_CSS; document.head.appendChild(link);
      }
      const script = document.createElement('script'); script.src = LEAFLET_JS; script.async = true;
      const timeout = setTimeout(() => reject(new Error('Tempo esgotado ao abrir o mapa.')),12000);
      script.onload = () => { clearTimeout(timeout); globalThis.L ? resolve(globalThis.L) : reject(new Error('Biblioteca do mapa indisponível.')); };
      script.onerror = () => { clearTimeout(timeout); reject(new Error('Biblioteca do mapa indisponível.')); };
      document.head.appendChild(script);
    });
    return leafletPromise;
  }
  async function fetchJson(url) {
    state.controller?.abort(); state.controller = new AbortController();
    const timeout = setTimeout(() => state.controller.abort(),10000);
    try {
      const response = await fetch(url,{signal:state.controller.signal,cache:'no-store'});
      if (!response.ok) throw new Error(`Fonte respondeu ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  function stop() {
    clearInterval(state.timer); state.timer = null;
    $('weatherPlay').setAttribute('aria-pressed','false'); $('weatherPlay').textContent = '▶'; $('weatherPlay').setAttribute('aria-label','Reproduzir animação');
  }
  function removeOverlay() {
    if (state.overlay && state.map) state.map.removeLayer(state.overlay);
    state.overlay = null;
  }
  function setFrames(frames, startAt) {
    state.frames = frames; state.index = Math.max(0,Math.min(startAt ?? frames.length - 1,frames.length - 1));
    const slider = $('weatherTimeline'); slider.max = String(Math.max(0,frames.length - 1)); slider.value = String(state.index); slider.disabled = frames.length < 2;
    $('weatherFramePrev').disabled = frames.length < 2; $('weatherFrameNext').disabled = frames.length < 2; $('weatherPlay').disabled = frames.length < 2;
  }
  function fadeTileLayer(layer, opacity) {
    layer.setOpacity?.(0); layer.addTo(state.map); requestAnimationFrame(() => layer.setOpacity?.(opacity));
    return layer;
  }
  function renderRainFrame() {
    const frame = state.frames[state.index]; if (!frame) return;
    removeOverlay();
    state.overlay = fadeTileLayer(L.tileLayer(`${frame.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,{opacity:.76,maxNativeZoom:7,maxZoom:11,attribution:'Radar: RainViewer'}),.76);
    $('weatherFrameTime').textContent = zoneTime(frame.time);
    $('weatherSourceNote').textContent = 'Radar observado · RainViewer · cobertura depende dos radares disponíveis; não é previsão.';
    $('weatherMapLegend').innerHTML = '<span>Fraca</span><i class="legend-rain"></i><span>Forte</span>';
  }
  function renderSatelliteFrame() {
    const frame = state.frames[state.index]; if (!frame) return;
    removeOverlay();
    const url = `${GIBS_ROOT}/MODIS_Aqua_CorrectedReflectance_TrueColor/default/${frame.date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
    const layer = L.tileLayer(url,{opacity:.88,maxNativeZoom:9,maxZoom:11,attribution:'Imagem: NASA GIBS'});
    let failures = 0;
    layer.on('tileerror',() => {
      failures++;
      if (failures === 5) setError('Alguns blocos da imagem orbital ainda não foram publicados para esta data. Tente o frame anterior.');
    });
    state.overlay = fadeTileLayer(layer,.88);
    $('weatherFrameTime').textContent = dateLabel(frame.date);
    $('weatherSourceNote').textContent = 'Observação orbital em cor natural · NASA GIBS / MODIS Aqua · produto diário, identificado pela data.';
    $('weatherMapLegend').innerHTML = '<span>Cor natural: nuvens claras, superfície e massas atmosféricas visíveis.</span>';
  }
  function cloudPoints(selectedCity) {
    const delta = .24, points = [];
    for (let row=-1; row<=1; row++) for (let col=-1; col<=1; col++) points.push({lat:selectedCity.lat-row*delta,lon:selectedCity.lon+col*delta,row,col});
    return points;
  }
  function renderCloudFrame() {
    const frame = state.frames[state.index]; if (!frame) return;
    removeOverlay();
    const delta = .24;
    const layers = frame.values.map((cover,index) => {
      const point = frame.points[index], opacity = .06 + Math.max(0,Math.min(100,Number(cover)||0)) / 100 * .7;
      return L.rectangle([[point.lat-delta/2,point.lon-delta/2],[point.lat+delta/2,point.lon+delta/2]],{stroke:false,fillColor:'#e8f3ff',fillOpacity:opacity,interactive:false});
    });
    state.overlay = L.layerGroup(layers).addTo(state.map);
    $('weatherFrameTime').textContent = frame.time.slice(11,16);
    $('weatherSourceNote').textContent = 'Cobertura de nuvens estimada · Open-Meteo · modelo no município e arredores, não imagem de satélite.';
    $('weatherMapLegend').innerHTML = '<span>Menos nuvens</span><i class="legend-clouds"></i><span>Mais nuvens</span>';
  }
  function renderFrame() {
    $('weatherTimeline').value = String(state.index);
    if (state.layer === 'rain') renderRainFrame(); else if (state.layer === 'satellite') renderSatelliteFrame(); else renderCloudFrame();
  }
  async function loadRain() {
    source('radar',{status:'loading'});
    const data = await fetchJson(RAIN_META);
    const frames = (data?.radar?.past || []).slice(-7).map(frame => ({...frame,host:data.host}));
    if (!frames.length) throw new Error('O radar não enviou frames recentes.');
    setFrames(frames,frames.length-1); renderFrame();
    source('radar',{status:'ready',dataAt:frames.at(-1).time*1000});
  }
  async function loadSatellite() {
    const frames = [utcDate(-3),utcDate(-2),utcDate(-1)].map(date => ({date}));
    setFrames(frames,frames.length-1); renderFrame();
    source('satellite',{status:'ready',dataAt:new Date(`${frames.at(-1).date}T12:00:00Z`).getTime()});
  }
  async function loadClouds() {
    source('clouds',{status:'loading'});
    const selectedCity = city(), points = cloudPoints(selectedCity);
    const params = new URLSearchParams({latitude:points.map(p=>p.lat).join(','),longitude:points.map(p=>p.lon).join(','),hourly:'cloud_cover',past_hours:'2',forecast_hours:'8',timezone:'auto'});
    const raw = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`);
    const rows = Array.isArray(raw) ? raw : [raw], times = rows[0]?.hourly?.time || [];
    const frames = times.map((time,i) => ({time,points,values:rows.map(row => row?.hourly?.cloud_cover?.[i])}));
    if (!frames.length || frames.some(frame => frame.values.length !== points.length)) throw new Error('A estimativa de nuvens veio incompleta.');
    const now = new Date(); let nearest = 0, distance = Infinity;
    times.forEach((time,i) => { const d=Math.abs(new Date(time).getTime()-now.getTime()); if(d<distance){distance=d;nearest=i;} });
    setFrames(frames,nearest); renderFrame();
    source('clouds',{status:'ready',dataAt:Date.now()});
  }
  async function selectLayer(name) {
    stop(); setError(''); state.controller?.abort(); removeOverlay(); state.layer = name;
    document.querySelectorAll('[data-weather-layer]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.weatherLayer===name)));
    $('weatherLayerName').textContent = name === 'rain' ? 'Chuva' : name === 'satellite' ? 'Satélite' : 'Nuvens';
    $('weatherMapTitle').textContent = name === 'rain' ? 'Chuva ao redor' : name === 'satellite' ? 'Satélite sobre a região' : 'Nuvens ao redor';
    $('weatherFrameTime').textContent = 'Carregando…'; $('weatherSourceNote').textContent = 'Consultando a fonte escolhida…';
    try {
      if (name === 'rain') await loadRain(); else if (name === 'satellite') await loadSatellite(); else await loadClouds();
    } catch (error) {
      const id = name === 'rain' ? 'radar' : name;
      source(id,{status:'error'}); setFrames([],0); setError('Esta camada está temporariamente indisponível. As outras continuam funcionando.');
      $('weatherFrameTime').textContent = 'Indisponível'; $('weatherSourceNote').textContent = error?.message || 'Dados temporariamente indisponíveis.';
    }
  }
  async function initMap() {
    await loadLeaflet();
    const selectedCity = city(); if (!selectedCity) throw new Error('Escolha uma cidade antes de abrir o mapa.');
    if (!state.map) {
      state.map = L.map('weatherMap',{zoomControl:true,minZoom:3,maxZoom:11}).setView([selectedCity.lat,selectedCity.lon],7);
      state.base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(state.map);
    } else state.map.setView([selectedCity.lat,selectedCity.lon],7);
    if (state.marker) state.map.removeLayer(state.marker);
    state.marker = L.circleMarker([selectedCity.lat,selectedCity.lon],{radius:7,color:'#fff',weight:3,fillColor:'#2f6bff',fillOpacity:1}).addTo(state.map).bindTooltip(`${selectedCity.name}/${selectedCity.uf}`);
    state.cityId = selectedCity.id; $('weatherMapCity').textContent = `${selectedCity.name}/${selectedCity.uf} · ponto do município, não da sua rua`;
    setTimeout(() => state.map.invalidateSize(),80);
  }
  async function open() {
    dialog.showModal(); $('closeWeatherMap').focus(); setError('');
    try { await initMap(); await selectLayer(state.layer); globalThis.pluviaAnalytics?.track('Weather Map Opened',{layer:state.layer,city:city()?.name,uf:city()?.uf}); }
    catch (error) { setError(error?.message || 'Não foi possível abrir o mapa agora.'); }
  }
  function step(amount) { if (!state.frames.length) return; state.index = (state.index + amount + state.frames.length) % state.frames.length; renderFrame(); }
  openButton.addEventListener('click',open);
  $('closeWeatherMap').addEventListener('click',() => { stop(); state.controller?.abort(); dialog.close(); });
  dialog.addEventListener('cancel',stop);
  document.querySelectorAll('[data-weather-layer]').forEach(button => button.addEventListener('click',() => selectLayer(button.dataset.weatherLayer)));
  $('weatherFramePrev').addEventListener('click',() => step(-1)); $('weatherFrameNext').addEventListener('click',() => step(1));
  $('weatherTimeline').addEventListener('input',event => { stop(); state.index=Number(event.target.value); renderFrame(); });
  $('weatherPlay').addEventListener('click',() => {
    if (state.timer) { stop(); return; }
    $('weatherPlay').setAttribute('aria-pressed','true'); $('weatherPlay').textContent='❚❚'; $('weatherPlay').setAttribute('aria-label','Pausar animação');
    state.timer=setInterval(() => step(1),state.layer==='satellite'?1300:850);
  });
  const sourceEntries = [
    ['INMET','Dado oficial','Avisos meteorológicos vigentes e previstos para o município.'],
    ['Defesa Civil de Manaus','Dado oficial','Comunicados municipais quando a cidade selecionada é Manaus.'],
    ['Open-Meteo','Estimativa meteorológica','Tempo, chuva, nuvens e qualidade do ar no ponto do município.'],
    ['RainViewer','Observação de radar','Composição de radares; cobertura e disponibilidade variam por região.'],
    ['NASA GIBS','Observação por satélite','Última imagem orbital diária completa, com a data do produto sempre visível.'],
    ['OpenStreetMap','Base cartográfica','Ruas e referências geográficas do mapa.'],
    ['IBGE','Referência territorial','Municípios, códigos e coordenadas centrais usadas na busca.']
  ];
  function renderSources() {
    const body = $('sourcesBody'); body.textContent = '';
    const intro = document.createElement('p'); intro.textContent = 'O PLUVIA separa alerta oficial, observação e estimativa para não vender modelo como fato.'; body.appendChild(intro);
    const list = document.createElement('div'); list.className = 'sources-list';
    sourceEntries.forEach(([name,kind,description]) => {
      const article=document.createElement('article'), tag=document.createElement('b'), title=document.createElement('strong'), copy=document.createElement('span');
      tag.textContent=kind.toUpperCase(); title.textContent=name; copy.textContent=description; article.append(tag,title,copy); list.appendChild(article);
    });
    body.appendChild(list);
    const pending=document.createElement('p'); pending.textContent='Cemaden, focos de calor e raios ainda não aparecem: faltou validar um endpoint público estável e adequado ao navegador. O PLUVIA não inventa esses dados.'; body.appendChild(pending);
  }
  $('openSources')?.addEventListener('click',() => { renderSources(); $('sourcesDialog').showModal(); $('closeSources').focus(); });
  $('closeSources')?.addEventListener('click',() => $('sourcesDialog').close());
  $('sourcesDialog')?.addEventListener('click',event => { if(event.target === $('sourcesDialog')) $('sourcesDialog').close(); });
  globalThis.PLUVIA.modules['weather-layers'].open = open;
  globalThis.PLUVIA.modules['weather-layers'].cityChanged = () => { if(dialog.open) initMap().then(()=>selectLayer(state.layer)).catch(error=>setError(error.message)); };
})();
