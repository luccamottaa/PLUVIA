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
  const radarDialog = $('radarDialog'), radarContent = $('radarMapContent');
  const radarHome = radarContent?.parentElement;
  let previousOverflow = '';
  let leafletPromise;
  let layerRevision = 0;
  const fading = new Map();
  let stationSignature='';

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
      const timeout = setTimeout(() => { leafletPromise=null; script.remove(); reject(new Error('Tempo esgotado ao abrir o mapa.')); },12000);
      script.onload = () => { clearTimeout(timeout); globalThis.L ? resolve(globalThis.L) : reject(new Error('Biblioteca do mapa indisponível.')); };
      script.onerror = () => { clearTimeout(timeout); leafletPromise=null; script.remove(); reject(new Error('Biblioteca do mapa indisponível.')); };
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
    $('weatherPlay').setAttribute('aria-pressed','false'); $('weatherPlay').setAttribute('aria-label','Reproduzir animação');
  }
  function removeOverlay() {
    for (const [layer,timer] of fading) { clearTimeout(timer); state.map?.removeLayer(layer); }
    fading.clear();
    if (state.nextOverlay && state.map) state.map.removeLayer(state.nextOverlay);
    state.nextOverlay = null;
    if (state.overlay && state.map) state.map.removeLayer(state.overlay);
    state.overlay = null;
  }
  function setFrames(frames, startAt) {
    state.frames = frames; state.index = Math.max(0,Math.min(startAt ?? frames.length - 1,frames.length - 1));
    const slider = $('weatherTimeline'); slider.max = String(Math.max(0,frames.length - 1)); slider.value = String(state.index); slider.disabled = frames.length < 2;
    $('weatherFramePrev').disabled = frames.length < 2; $('weatherFrameNext').disabled = frames.length < 2; $('weatherPlay').disabled = frames.length < 2;
  }
  function fadeTileLayer(layer, opacity) {
    if (state.nextOverlay) state.map.removeLayer(state.nextOverlay);
    const previous = state.overlay;
    state.nextOverlay = layer;
    layer.setOpacity?.(0);
    layer.on('load',() => {
      if (state.nextOverlay !== layer) return;
      state.nextOverlay = null; state.overlay = layer;
      requestAnimationFrame(() => {
        if (state.overlay !== layer) return;
        layer.setOpacity?.(opacity);
        previous?.setOpacity?.(0);
      });
      if (previous) fading.set(previous,setTimeout(() => { state.map.removeLayer(previous); fading.delete(previous); },450));
    });
    layer.addTo(state.map);
  }
  function renderRainFrame() {
    const frame = state.frames[state.index]; if (!frame) return;
    fadeTileLayer(L.tileLayer(`${frame.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,{opacity:.76,maxNativeZoom:7,maxZoom:11,attribution:'Radar: RainViewer'}),.76);
    $('weatherFrameTime').textContent = zoneTime(frame.time);
    $('weatherSourceNote').textContent = 'Radar observado · RainViewer · cobertura depende dos radares disponíveis; não é previsão.';
    $('weatherMapLegend').innerHTML = '<span>Fraca</span><i class="legend-rain"></i><span>Forte</span>';
  }
  const SATELLITE_LAYER = 'GOES-East_ABI_GeoColor';
  const SATELLITE_MATRIX = 'GoogleMapsCompatible_Level7';
  const SATELLITE_ROOT = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
  function satelliteFrames(xml, now = Date.now()) {
    const domain = xml.match(/<Domain>([^<]+)<\/Domain>/)?.[1];
    if (!domain) throw new Error('O satélite não informou horários disponíveis.');
    const times = new Set();
    for (const range of domain.split(',')) {
      const [startText,endText,period] = range.trim().split('/');
      const start = Date.parse(startText), end = Date.parse(endText || startText);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || (period && period !== 'PT10M')) continue;
      for (let time=end, count=0; time>=start && count<72; time-=600000,count++) {
        if (time<=now && now-time<=6*3600000) times.add(time/1000);
      }
    }
    const frames = [...times].sort((a,b)=>a-b).slice(-7).map(time=>({time}));
    if (!frames.length) throw new Error('Sem imagens recentes de satélite. Tente novamente mais tarde.');
    return frames;
  }
  function renderCloudFrame() {
    const frame = state.frames[state.index]; if (!frame) return;
    setError('');
    const iso = new Date(frame.time*1000).toISOString().replace('.000Z','Z');
    const overlay = L.tileLayer(`${SATELLITE_ROOT}/${SATELLITE_LAYER}/default/${iso}/${SATELLITE_MATRIX}/{z}/{y}/{x}.png`,{
      opacity:0,maxNativeZoom:6,maxZoom:6,noWrap:true,className:'pluvia-cloud-overlay',
      attribution:'GOES-East / NOAA · NASA GIBS'
    });
    let loaded = 0, failed = 0;
    overlay.on('tileload',() => { loaded++; });
    overlay.on('tileerror',() => { failed++; });
    overlay.on('load',() => {
      if ((state.overlay !== overlay && state.nextOverlay !== overlay) || state.layer !== 'clouds') return;
      if (!loaded) {
        stop(); setError('Imagem de satélite indisponível nesta região ou horário.');
        source('clouds',{status:'error'});
      } else {
        if (failed) setError('Parte da imagem não carregou. Tente outro horário.');
        source('clouds',{status:'ready',dataAt:frame.time*1000});
      }
    });
    fadeTileLayer(overlay,.92);
    state.marker?.closeTooltip?.();
    const date = new Intl.DateTimeFormat('pt-BR',{timeZone:city()?.timezone || 'UTC',day:'2-digit',month:'2-digit'}).format(new Date(frame.time*1000));
    $('weatherFrameTime').textContent = date + ' · ' + zoneTime(frame.time);
    $('weatherSourceNote').textContent = 'Satélite GOES-East · NOAA / NASA GIBS · imagem observada no horário indicado, com atraso de processamento. Composição GeoColor de dia e infravermelho à noite.';
    $('weatherMapLegend').innerHTML = '<span>Nuvens · GOES-East</span>';
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
    if (!httpClient?.getText) throw new Error('Cliente de satélite indisponível. Recarregue o app.');
    const now = Date.now(), start = new Date(now-6*3600000).toISOString().replace(/\.\d{3}Z$/,'Z');
    const end = new Date(now).toISOString().replace(/\.\d{3}Z$/,'Z');
    const url = `${SATELLITE_ROOT}/1.0.0/${SATELLITE_LAYER}/default/${SATELLITE_MATRIX}/all/${start}--${end}.xml`;
    const xml = await httpClient.getText(url,{timeoutMs:15000});
    if (revision !== layerRevision) return;
    const frames = satelliteFrames(xml,now);
    setFrames(frames,frames.length-1); renderFrame();
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
      Date.now()-data.checkedAt > 300_000 || data.checkedAt-Date.now() > 60_000 || data.windowMinutes !== 5 || data.radiusKm !== 40 || data.events.length > 100) throw new Error('Leitura de raios indisponível ou antiga.');
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
  function loadStations() {
    const data=globalThis.PLUVIA?.nowcast?.get();
    stationSignature=JSON.stringify(data?.stations || []);
    if (!data?.stations?.length) throw new Error('Sem boletim recente da estação. Atualize o card Nowcast.');
    const marks=data.stations.map(station=>{
      const tooltip=document.createElement('span');
      tooltip.textContent=`${station.name} · ${zoneTime(station.observedAt/1000)} · ${globalThis.PLUVIA.nowcast.stationText?.(station) || station.source}`;
      return L.circleMarker([station.lat,station.lon],{radius:8,color:'#fff',weight:2,fillColor:'#25a38d',fillOpacity:.9}).bindTooltip(tooltip);
    });
    state.overlay=L.layerGroup(marks).addTo(state.map);setFrames([],0);
    $('weatherFrameTime').textContent=zoneTime(data.stations[0].observedAt/1000);
    $('weatherSourceNote').textContent=`${data.stations[0].source} · observação pontual, sem estimativa de chegada da chuva. A marca azul é a referência do município.`;
    $('weatherMapLegend').textContent='Estação observada · '+data.stations.map(station=>station.name).join(', ');
  }
  async function selectLayer(name) {
    if (!['rain','clouds','lightning','stations'].includes(name)) return;
    if (!state.map) {
      state.layer = name;
      if (!initializing) showMap();
      return;
    }
    const revision = ++layerRevision;
    stop(); setError(''); httpClient?.abortAll(); removeOverlay(); state.layer = name;
    // Satellite tiles are native at zoom 6; avoid magnifying them into large blocks.
    state.map.setMaxZoom?.(name === 'clouds' ? 6 : 11);
    if (name === 'clouds' && state.map.getZoom?.() > 6) state.map.setZoom?.(6);
    $('weatherLightningAttribution').hidden = name !== 'lightning';
    setFrames([],0);
    document.querySelectorAll('[data-weather-layer]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.weatherLayer===name)));
    $('weatherLayerName').textContent = name === 'rain' ? 'Chuva' : name === 'clouds' ? 'Nuvens' : name === 'stations' ? 'Estação' : 'Raios';
    $('weatherFrameTime').textContent = 'Carregando…'; $('weatherSourceNote').textContent = 'Consultando a fonte escolhida…';
    try {
      if (name === 'rain') await loadRain(revision); else if (name === 'clouds') await loadClouds(revision); else if (name === 'stations') loadStations(); else await loadLightning(revision);
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
      state.base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{className:'pluvia-light-basemap',maxZoom:19,attribution:'© OpenStreetMap'}).addTo(state.map);
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
    let initialized = false;
    initializing = true; setError('');
    try {
      await initMap();
      initialized = true;
      await selectLayer(state.layer);
      globalThis.pluviaAnalytics?.track('Weather Map Viewed',{layer:state.layer,city:city()?.name,uf:city()?.uf});
    } catch (error) { setError(error?.message || 'Não foi possível carregar o mapa agora.'); }
    finally {
      initializing = false;
      if (initialized && state.map && city()?.id !== state.cityId && (mapVisible || radarDialog?.open)) showMap();
    }
  }
  function step(amount) { if (!state.frames.length || state.nextOverlay) return; state.index = (state.index + amount + state.frames.length) % state.frames.length; renderFrame(); }
  function resizeMap() { requestAnimationFrame(() => state.map?.invalidateSize?.({pan:false})); }
  $('expandRadar')?.addEventListener('click',() => {
    if (!radarDialog || radarDialog.open || !radarContent) return;
    previousOverflow = document.body.style.overflow;
    $('radarDialogContent').appendChild(radarContent);
    radarDialog.showModal(); document.body.style.overflow='hidden';
    mapVisible=true; if (!state.map || state.cityId !== city()?.id) showMap();
    resizeMap(); $('closeRadar').focus();
  });
  $('closeRadar')?.addEventListener('click',() => globalThis.PLUVIA?.dialogs?.close(radarDialog) ?? radarDialog.close());
  radarDialog?.addEventListener('close',() => {
    stop(); radarHome?.appendChild(radarContent); document.body.style.overflow=previousOverflow;
    resizeMap(); $('expandRadar')?.focus();
  });
  radarDialog?.addEventListener('click',event => { if (event.target === radarDialog) globalThis.PLUVIA?.dialogs?.close(radarDialog) ?? radarDialog.close(); });
  if ('ResizeObserver' in globalThis && radarContent) new ResizeObserver(resizeMap).observe(radarContent);
  globalThis.addEventListener?.('resize',resizeMap,{passive:true});
  document.addEventListener?.('visibilitychange',() => { if (document.hidden) stop(); });
  if ('IntersectionObserver' in globalThis) {
    const observer = new IntersectionObserver(entries => {
      mapVisible = entries.some(entry => entry.isIntersecting);
      if (!mapVisible && !radarDialog?.open) stop();
      if (mapVisible && (!state.map || city()?.id !== state.cityId)) showMap();
    },{rootMargin:'240px'});
    observer.observe(mapCard);
  } else { mapVisible = true; showMap(); }
  document.querySelectorAll('[data-weather-layer]').forEach(button => button.addEventListener('click',() => selectLayer(button.dataset.weatherLayer)));
  $('weatherFramePrev').addEventListener('click',() => step(-1)); $('weatherFrameNext').addEventListener('click',() => step(1));
  $('weatherTimeline').addEventListener('input',event => { stop(); state.index=Number(event.target.value); renderFrame(); });
  $('weatherPlay').addEventListener('click',() => {
    if (state.timer) { stop(); return; }
    $('weatherPlay').setAttribute('aria-pressed','true'); $('weatherPlay').setAttribute('aria-label','Pausar animação');
    state.timer=setInterval(() => step(1),1400);
  });
  const sourceEntries = [
    ['NOAA Aviation Weather Center','Observação METAR','Boletim do aeroporto Eduardo Gomes (SBEG), com horário da observação. Descreve a estação, sem confirmar chuva nos demais bairros.'],
    ['INMET','Dado oficial','Avisos meteorológicos vigentes e previstos para o município.'],
    ['Open-Meteo','Estimativa meteorológica','Tempo, chuva e qualidade do ar no ponto do município.'],
    ['NOAA / NASA GIBS','Nuvens observadas por satélite','Imagens GOES-East GeoColor, com horário da captura e atraso de processamento.'],
    ['MET Norway','Previsão meteorológica','Fonte principal de temperatura, vento e precipitação. Quando indisponível, usamos Open-Meteo. Dados CC BY 4.0.'],
    ['RainViewer','Observação de radar','Composição de radares; cobertura e disponibilidade variam por região.'],
    ['Vaisala Xweather','Raios observados sob demanda','Detecções nos últimos cinco minutos em até 40 km; disponível após ativação das credenciais no servidor.'],
    ['OpenStreetMap','Base cartográfica','Ruas e referências geográficas do mapa.'],
    ['IBGE','Referência territorial','Municípios, códigos e coordenadas centrais usadas na busca.']
  ];
  function renderSources() {
    const body = $('sourcesBody'); body.textContent = '';
    const intro = document.createElement('p'); intro.textContent = 'Saiba de onde vêm os dados e como interpretar cada informação.'; body.appendChild(intro);
    const list = document.createElement('div'); list.className = 'sources-list';
    sourceEntries.forEach(([name,kind,description]) => {
      const article=document.createElement('article'), tag=document.createElement('b'), title=document.createElement('strong'), copy=document.createElement('span');
      tag.textContent=kind.toUpperCase(); title.textContent=name; copy.textContent=description; article.dataset.kind = kind.includes('oficial') ? 'official' : /Observa|observad|satélite/.test(kind) ? 'observation' : 'reference'; article.append(tag,title,copy); list.appendChild(article);
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
  $('openSources')?.addEventListener('click',() => { renderSources(); $('sourcesDialog').showModal(); $('sourcesDialog').querySelector?.('.dialog-scroll')?.scrollTo?.(0,0); $('closeSources').focus(); });
  $('closeSources')?.addEventListener('click',() => globalThis.PLUVIA?.dialogs?.close($('sourcesDialog')) ?? $('sourcesDialog').close());
  $('sourcesDialog')?.addEventListener('click',event => { if(event.target === $('sourcesDialog')) globalThis.PLUVIA?.dialogs?.close($('sourcesDialog')) ?? $('sourcesDialog').close(); });
  globalThis.PLUVIA.modules['weather-layers'].cityChanged = () => {
    if (state.cityId === city()?.id) return;
    ++layerRevision; httpClient?.abortAll(); stop(); removeOverlay(); setFrames([],0);
    if (state.layer==='stations' && !globalThis.PLUVIA?.nowcast?.regionFor?.(city())) state.layer='rain';
    if (mapVisible || radarDialog?.open) showMap();
  };
  globalThis.PLUVIA.modules['weather-layers'].selectLayer=selectLayer;
  globalThis.addEventListener?.('pluvia:nowcast-updated',()=>{
    if ($('weatherStationsLayer')) $('weatherStationsLayer').hidden=!globalThis.PLUVIA?.nowcast?.regionFor?.(city());
    if (state.map && state.layer==='stations' && JSON.stringify(globalThis.PLUVIA?.nowcast?.get()?.stations || [])!==stationSignature) selectLayer('stations');
  });
})();
