(function () {
  const $ = id => document.getElementById(id);
  const mapCard = document.querySelector('.weather-map-card');
  if (!mapCard || !$('weatherMap')) return;

  const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  const RAIN_META = 'https://api.rainviewer.com/public/weather-maps.json';
  const LIGHTNING_ENDPOINT = 'https://dszyyrcvwrpyiypwyvxe.supabase.co/functions/v1/lightning';
  const httpClient = globalThis.PLUVIA?.http?.createClient?.({defaultTimeoutMs:10000});
  const state = { map:null, base:null, overlay:null, marker:null, layer:'rain', frames:[], index:0, timer:null, cityId:null };
  let leafletPromise;
  let layerRevision = 0;

  function source(id, patch) { globalThis.PLUVIA?.sources?.set(id, {...patch, checkedAt:Date.now()}); }
  function setError(message) { $('weatherMapError').hidden = !message; $('weatherMapError').textContent = message || ''; }
  function city() { return typeof activeCity !== 'undefined' ? activeCity : null; }
  function zoneTime(unix) {
    const value = new Date(unix * 1000);
    return new Intl.DateTimeFormat('pt-BR',{timeZone:city()?.timezone || 'UTC',hour:'2-digit',minute:'2-digit'}).format(value);
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
    if (!httpClient) throw new Error('Cliente de dados do mapa indisponível.');
    httpClient.abortAll();
    return httpClient.getJson(url,{timeoutMs:10000,cache:'no-store'});
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
    $('weatherFrameTime').textContent = zoneTime(frame.time);
    $('weatherSourceNote').textContent = 'Cobertura de nuvens estimada · Open-Meteo · modelo no município e arredores.';
    $('weatherMapLegend').innerHTML = '<span>Menos nuvens</span><i class="legend-clouds"></i><span>Mais nuvens</span>';
  }
  function renderFrame() {
    $('weatherTimeline').value = String(state.index);
    if (state.layer === 'rain') renderRainFrame(); else if (state.layer === 'clouds') renderCloudFrame();
  }
  async function loadRain(revision) {
    source('radar',{status:'loading'});
    const data = await fetchJson(RAIN_META);
    if (revision !== layerRevision) return;
    const frames = (data?.radar?.past || []).slice(-7).map(frame => ({...frame,host:data.host}));
    if (!frames.length) throw new Error('O radar não enviou frames recentes.');
    setFrames(frames,frames.length-1); renderFrame();
    source('radar',{status:'ready',dataAt:frames.at(-1).time*1000});
  }
  async function loadClouds(revision) {
    source('clouds',{status:'loading'});
    const selectedCity = city(), points = cloudPoints(selectedCity);
    const params = new URLSearchParams({latitude:points.map(p=>p.lat).join(','),longitude:points.map(p=>p.lon).join(','),hourly:'cloud_cover',past_hours:'2',forecast_hours:'8',timeformat:'unixtime',timezone:'auto'});
    const raw = await fetchJson(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (revision !== layerRevision) return;
    const rows = Array.isArray(raw) ? raw : [raw], times = rows[0]?.hourly?.time || [];
    const frames = times.map((time,i) => ({time,points,values:rows.map(row => row?.hourly?.cloud_cover?.[i])}));
    if (!frames.length || frames.some(frame => !Number.isFinite(frame.time) || frame.values.length !== points.length || frame.values.some(value => !Number.isFinite(value) || value < 0 || value > 100))) throw new Error('A estimativa de nuvens veio incompleta.');
    const now = new Date(); let nearest = 0, distance = Infinity;
    times.forEach((time,i) => { const d=Math.abs(time*1000-now.getTime()); if(d<distance){distance=d;nearest=i;} });
    setFrames(frames,nearest); renderFrame();
    source('clouds',{status:'ready',dataAt:Date.now()});
  }
  async function loadLightning(revision) {
    source('lightning',{status:'loading'});
    const selectedCity = city();
    const url = new URL(LIGHTNING_ENDPOINT);
    url.searchParams.set('lat',Number(selectedCity.lat).toFixed(2));
    url.searchParams.set('lon',Number(selectedCity.lon).toFixed(2));
    const data = await fetchJson(url.href);
    if (revision !== layerRevision) return;
    if (data?.source !== 'Vaisala Xweather' || !Array.isArray(data.events) || !Number.isFinite(data.checkedAt) ||
      Date.now()-data.checkedAt > 660_000 || data.events.length > 100) throw new Error('Leitura de raios indisponível ou antiga.');
    const marks = data.events.map(event => {
      if (!Number.isFinite(event.lat) || !Number.isFinite(event.lon) || !Number.isFinite(event.time) || !['CG','IC'].includes(event.type)) throw new Error('Leitura de raios inválida.');
      return L.circleMarker([event.lat,event.lon],{radius:event.type === 'CG' ? 6 : 4,color:'#fff',weight:1.5,
        fillColor:event.type === 'CG' ? '#ffc247' : '#8b7bff',fillOpacity:.9,interactive:false});
    });
    state.overlay = L.layerGroup(marks).addTo(state.map);
    setFrames([],0);
    const checked = zoneTime(data.checkedAt/1000);
    $('weatherFrameTime').textContent = `${checked} · últimos 5 min`;
    $('weatherSourceNote').textContent = data.events.length
      ? `${data.events.length}${data.truncated ? '+' : ''} registro(s) em até 40 km · consulta de ${checked}. Raios observados, não previsão nem alerta.`
      : `Nenhum registro retornado na consulta de ${checked} em até 40 km. Isso não confirma ausência de raios agora.`;
    $('weatherMapLegend').innerHTML = '<span><i class="legend-strike"></i> Solo</span><span><i class="legend-cloud-strike"></i> Nuvem</span>';
    source('lightning',{status:'ready',dataAt:data.checkedAt});
  }
  async function selectLayer(name) {
    if (!['rain','clouds','lightning'].includes(name)) return;
    if (!state.map) {
      state.layer = name;
      if (!initializing) showMap();
      return;
    }
    const revision = ++layerRevision;
    stop(); setError(''); httpClient?.abortAll(); removeOverlay(); state.layer = name;
    $('weatherLightningAttribution').hidden = name !== 'lightning';
    setFrames([],0);
    document.querySelectorAll('[data-weather-layer]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.weatherLayer===name)));
    $('weatherLayerName').textContent = name === 'rain' ? 'Chuva' : name === 'clouds' ? 'Nuvens' : 'Raios';
    $('weatherFrameTime').textContent = 'Carregando…'; $('weatherSourceNote').textContent = 'Consultando a fonte escolhida…';
    try {
      if (name === 'rain') await loadRain(revision); else if (name === 'clouds') await loadClouds(revision); else await loadLightning(revision);
    } catch (error) {
      if (revision !== layerRevision) return;
      const id = name === 'rain' ? 'radar' : name;
      source(id,{status:'error'}); setFrames([],0); setError('Esta camada está temporariamente indisponível. As outras continuam funcionando.');
      $('weatherFrameTime').textContent = 'Indisponível'; $('weatherSourceNote').textContent = name === 'lightning'
        ? 'Raios ainda não ativados ou temporariamente indisponíveis. Nenhuma observação foi confirmada.'
        : error?.message || 'Dados temporariamente indisponíveis.';
    }
  }
  async function initMap() {
    await loadLeaflet();
    const selectedCity = city(); if (!selectedCity) throw new Error('Escolha uma cidade para ver o mapa.');
    if (!state.map) {
      state.map = L.map('weatherMap',{zoomControl:true,minZoom:3,maxZoom:11}).setView([selectedCity.lat,selectedCity.lon],7);
      state.base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(state.map);
    } else state.map.setView([selectedCity.lat,selectedCity.lon],7);
    if (state.marker) state.map.removeLayer(state.marker);
    state.marker = L.circleMarker([selectedCity.lat,selectedCity.lon],{radius:7,color:'#fff',weight:3,fillColor:'#2f6bff',fillOpacity:1}).addTo(state.map).bindTooltip(`${selectedCity.name}/${selectedCity.uf}`);
    state.cityId = selectedCity.id; $('weatherMapCity').textContent = `${selectedCity.name}/${selectedCity.uf} · ponto de referência do município`;
    setTimeout(() => state.map.invalidateSize(),80);
  }
  let initializing = false;
  let mapVisible = false;
  async function showMap() {
    if (initializing || !city()) return;
    initializing = true; setError('');
    try {
      await initMap();
      await selectLayer(state.layer);
      globalThis.pluviaAnalytics?.track('Weather Map Viewed',{layer:state.layer,city:city()?.name,uf:city()?.uf});
    } catch (error) { setError(error?.message || 'Não foi possível carregar o mapa agora.'); }
    finally {
      initializing = false;
      if (state.map && city()?.id !== state.cityId) showMap();
    }
  }
  function step(amount) { if (!state.frames.length) return; state.index = (state.index + amount + state.frames.length) % state.frames.length; renderFrame(); }
  if ('IntersectionObserver' in globalThis) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { mapVisible = true; observer.disconnect(); showMap(); }
    },{rootMargin:'240px'});
    observer.observe(mapCard);
  } else { mapVisible = true; showMap(); }
  document.querySelectorAll('[data-weather-layer]').forEach(button => button.addEventListener('click',() => selectLayer(button.dataset.weatherLayer)));
  $('weatherFramePrev').addEventListener('click',() => step(-1)); $('weatherFrameNext').addEventListener('click',() => step(1));
  $('weatherTimeline').addEventListener('input',event => { stop(); state.index=Number(event.target.value); renderFrame(); });
  $('weatherPlay').addEventListener('click',() => {
    if (state.timer) { stop(); return; }
    $('weatherPlay').setAttribute('aria-pressed','true'); $('weatherPlay').textContent='❚❚'; $('weatherPlay').setAttribute('aria-label','Pausar animação');
    state.timer=setInterval(() => step(1),850);
  });
  const sourceEntries = [
    ['INMET','Dado oficial','Avisos meteorológicos vigentes e previstos para o município.'],
    ['Open-Meteo','Estimativa meteorológica','Tempo, chuva, nuvens e qualidade do ar no ponto do município.'],
    ['MET Norway','Segunda previsão','Temperatura, vento e precipitação previstos no ponto de referência; dados CC BY 4.0.'],
    ['RainViewer','Observação de radar','Composição de radares; cobertura e disponibilidade variam por região.'],
    ['Vaisala Xweather','Raios observados sob demanda','Detecções nos últimos cinco minutos em até 40 km; disponível após ativação das credenciais no servidor.'],
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
    const official=document.createElement('section'); official.className='official-observations';
    const heading=document.createElement('h3'); heading.textContent='Outras observações oficiais'; official.appendChild(heading);
    const note=document.createElement('p'); note.textContent='Consulte os painéis oficiais abaixo. Eles abrem em outro site; ainda não são camadas do mapa do PLUVIA.'; official.appendChild(note);
    [
      ['Chuva medida por estações · Cemaden','https://mapainterativo.cemaden.gov.br/'],
      ['Focos de fogo por satélite · INPE','https://terrabrasilis.dpi.inpe.br/queimadas/bdqueimadas/'],
      ['Raios detectados por satélite · NOAA','https://www.star.nesdis.noaa.gov/goes/'],
      ['Rede de raios · Vaisala Xweather','https://www.xweather.com/']
    ].forEach(([label,url]) => {
      const link=document.createElement('a'); link.href=url; link.target='_blank'; link.rel='noopener noreferrer'; link.textContent=label; official.appendChild(link);
    });
    body.appendChild(official);
  }
  $('openSources')?.addEventListener('click',() => { renderSources(); $('sourcesDialog').showModal(); $('closeSources').focus(); });
  $('closeSources')?.addEventListener('click',() => $('sourcesDialog').close());
  $('sourcesDialog')?.addEventListener('click',event => { if(event.target === $('sourcesDialog')) $('sourcesDialog').close(); });
  globalThis.PLUVIA.modules['weather-layers'].cityChanged = () => {
    if (mapVisible && !initializing) showMap();
  };
})();
