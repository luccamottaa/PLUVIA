(function () {
  const $ = id => document.getElementById(id);
  const mapCard = document.querySelector('.weather-map-card');
  if (!mapCard || !$('weatherMap')) return;

  // Leaflet 1.9.4 (BSD-2) is served locally: no third-party CDN can block or alter the map.
  const LEAFLET_JS = '/vendor/leaflet/leaflet.js?v=1.9.4';
  const LEAFLET_CSS = '/vendor/leaflet/leaflet.css?v=1.9.4';
  const RAIN_META = 'https://api.rainviewer.com/public/weather-maps.json';
  const httpClient = globalThis.PLUVIA?.http?.createClient?.({defaultTimeoutMs:10000});
  const state = { map:null, base:null, overlay:null, marker:null, layer:'rain', frames:[], index:0, timer:null, cityId:null };
  const radarDialog = $('radarDialog'), radarContent = $('radarMapContent');
  const radarHome = radarContent?.parentElement;
  let previousOverflow = '';
  let leafletPromise;
  let layerRevision = 0;
  const fading = new Map();
  let stationSignature='';
  let pendingTimeout=null,radarSnapshot=null,displayedFrameKey=null,pendingFrameKey=null,displayedPartial=false,resizePending=false;
  const lastSize={width:0,height:0};

  function source(id, patch) { globalThis.PLUVIA?.sources?.set(id, {...patch, checkedAt:Date.now()}); }
  function setError(message) { $('weatherMapError').hidden = !message; $('weatherMapError').textContent = message || ''; }
  function frameStatus(busy,message,retry=false) {
    $('weatherMap').setAttribute('aria-busy',String(busy));
    if ($('weatherFrameStatus')) $('weatherFrameStatus').textContent=message || '';
    if ($('weatherMapRetry')) $('weatherMapRetry').hidden=!retry;
  }
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
  function cancelPending() {
    clearTimeout(pendingTimeout);pendingTimeout=null;pendingFrameKey=null;
    if (state.nextOverlay) state.map?.removeLayer(state.nextOverlay);
    state.nextOverlay=null;
  }
  function removeOverlay() {
    cancelPending(); displayedFrameKey=null;displayedPartial=false;
    for (const [layer,timer] of fading) { clearTimeout(timer); state.map?.removeLayer(layer); }
    fading.clear();
    if (state.overlay && state.map) state.map.removeLayer(state.overlay);
    state.overlay = null;
  }
  function setFrames(frames, startAt) {
    state.frames = frames; state.index = Math.max(0,Math.min(startAt ?? frames.length - 1,frames.length - 1));
    const slider = $('weatherTimeline'); slider.max = String(Math.max(0,frames.length - 1)); slider.value = String(state.index); slider.disabled = frames.length < 2;
    $('weatherFramePrev').disabled = frames.length < 2; $('weatherFrameNext').disabled = frames.length < 2; $('weatherPlay').disabled = frames.length < 2;
  }
  function fadeTileLayer(layer, opacity, options={}) {
    cancelPending();
    const previous = state.overlay;
    state.nextOverlay = layer;
    pendingFrameKey=options.key || null;
    let loaded=0,failed=0;
    layer.on('loading',()=>{if(state.nextOverlay===layer){loaded=0;failed=0;}});
    layer.on('tileload',()=>{loaded++;});layer.on('tileerror',()=>{failed++;});
    frameStatus(true,options.loading || 'Carregando imagem…');
    function fail(message) {
      if (state.nextOverlay!==layer) return;
      clearTimeout(pendingTimeout);pendingTimeout=null;pendingFrameKey=null;state.nextOverlay=null;
      state.map.removeLayer(layer);stop();
      frameStatus(false,previous ? 'A imagem anterior continua exibida.' : 'Imagem indisponível.',true);
      setError(message);options.onError?.();
    }
    pendingTimeout=setTimeout(()=>fail('Esta imagem demorou para carregar. Tente outro horário ou tente novamente.'),10000);
    layer.setOpacity?.(0);
    layer.on('load',() => {
      if (state.nextOverlay !== layer) return;
      if (!loaded) {fail('A imagem deste horário não carregou. Tente outro horário ou tente novamente.');return;}
      clearTimeout(pendingTimeout);pendingTimeout=null;pendingFrameKey=null;
      state.nextOverlay = null; state.overlay = layer;
      displayedFrameKey=options.key || null;
      displayedPartial=Boolean(failed);
      options.onReady?.(failed);
      frameStatus(false,failed ? 'Parte da imagem não carregou.' : 'Imagem carregada.',Boolean(failed));
      setError(failed ? 'Parte da imagem não carregou. Tente outro horário ou tente novamente.' : '');
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
    fadeTileLayer(L.tileLayer(`${frame.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,{opacity:.76,maxNativeZoom:7,maxZoom:11,attribution:'Radar: RainViewer'}),.76,{
      key:'rain:'+frame.time,loading:'Carregando imagem de '+zoneTime(frame.time)+'…',
      onReady(failed) {$('weatherFrameTime').textContent=zoneTime(frame.time);source('radar',{status:failed ? 'partial' : 'ready',dataAt:frame.time*1000});},
      onError() {source('radar',{status:'error'});}
    });
    $('weatherSourceNote').textContent = 'Radar observado · RainViewer · cobertura depende dos radares disponíveis; não é previsão.';
    $('weatherMapLegend').innerHTML = '<span>Fraca</span><i class="legend-rain"></i><span>Forte</span>';
  }
  function renderFrame(force=false) {
    $('weatherTimeline').value = String(state.index);
    const key=state.layer+':'+state.frames[state.index]?.time;
    if (!force && state.nextOverlay && pendingFrameKey===key) return;
    if (!force && state.overlay && displayedFrameKey===key) {
      cancelPending();frameStatus(false,displayedPartial ? 'Parte da imagem não carregou.' : 'Imagem carregada.',displayedPartial);
      setError(displayedPartial ? 'Parte da imagem não carregou. Tente outro horário ou tente novamente.' : '');return;
    }
    if (state.layer === 'rain') renderRainFrame();
  }
  async function loadRain(revision) {
    source('radar',{status:'loading'});
    const cached=radarSnapshot && Date.now()>=radarSnapshot.at && Date.now()-radarSnapshot.at<120000;
    const data = cached ? radarSnapshot.data : await fetchJson(RAIN_META);
    if (revision !== layerRevision) return;
    const recent = (Array.isArray(data?.radar?.past) ? data.radar.past : []).filter(frame=>Number.isFinite(frame.time) && frame.time*1000<=Date.now()+60000 && Date.now()-frame.time*1000<3*3600000 && typeof frame.path==='string' && /^\/[\w/-]+$/.test(frame.path));
    const frames = [...new Map(recent.map(frame=>[frame.time,frame])).values()].sort((a,b)=>a.time-b.time).slice(-7).map(frame=>({...frame,host:data.host}));
    if (typeof data?.host!=='string' || !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(data.host)) throw new Error('O radar enviou uma referência inválida.');
    if (!frames.length) throw new Error('O radar não enviou frames recentes.');
    radarSnapshot={data,at:cached ? radarSnapshot.at : Date.now()};
    setFrames(frames,frames.length-1); renderFrame();
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
    if (!['rain','stations'].includes(name)) return;
    if (!state.map) {
      state.layer = name;
      if (!initializing) showMap();
      return;
    }
    const revision = ++layerRevision;
    stop(); setError(''); httpClient?.abortAll(); removeOverlay(); state.layer = name;
    setFrames([],0);
    document.querySelectorAll('[data-weather-layer]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.weatherLayer===name)));
    $('weatherLayerName').textContent = name === 'stations' ? 'Estação' : 'Chuva';
    $('weatherFrameTime').textContent = 'Carregando…'; $('weatherSourceNote').textContent = 'Consultando a fonte escolhida…';
    frameStatus(true,'Consultando a fonte escolhida…');
    try {
      if (name === 'rain') await loadRain(revision); else loadStations();
      if (revision===layerRevision && name==='stations') frameStatus(false,'Observação carregada.');
    } catch (error) {
      if (revision !== layerRevision) return;
      source(name === 'rain' ? 'radar' : name,{status:'error'}); setFrames([],0); setError('Esta camada está temporariamente indisponível. Tente novamente.');
      frameStatus(false,'Não foi possível carregar esta camada.',true);
      $('weatherFrameTime').textContent = 'Indisponível'; $('weatherSourceNote').textContent = error?.message || 'Dados temporariamente indisponíveis.';
    }
  }
  // Botão de localização, como o dos apps de mapa: só por toque, pede a posição ao navegador uma vez
  // (sem watch nem background), mostra o ponto "você está aqui" e centraliza nele. A posição fica só
  // em memória nesta página; não é salva, enviada ou usada para trocar a cidade. Sem permissão ou
  // sem GPS, volta ao ponto de referência do município.
  const reduceMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let locating = 0;
  function recenterTarget() {
    const selectedCity = city();
    return state.user ? [state.user.lat,state.user.lon] : selectedCity ? [selectedCity.lat,selectedCity.lon] : null;
  }
  function updateRecenter() {
    const button = $('weatherMapRecenter'), target = recenterTarget();
    if (!button || !state.map || !target) return;
    const point = state.map.latLngToContainerPoint(target);
    const size = state.map.getSize();
    const centered = Math.hypot(point.x - size.x / 2, point.y - size.y / 2) < 12;
    button.dataset.centered = String(centered);
  }
  function centerOn(target, zoom) {
    state.map.setView(target,Math.max(state.map.getZoom?.() || 7,zoom),{animate:!reduceMotion()});
  }
  function showUser(position) {
    const lat = Number(position?.coords?.latitude), lon = Number(position?.coords?.longitude), accuracy = Number(position?.coords?.accuracy);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
    state.user = {lat,lon};
    for (const layer of [state.userHalo,state.userMarker]) if (layer) state.map.removeLayer(layer);
    // Halo da precisão informada pelo aparelho (limitado para não cobrir o mapa) e o ponto por cima.
    state.userHalo = Number.isFinite(accuracy) && accuracy > 0 ? L.circle([lat,lon],{radius:Math.min(accuracy,5000),color:'#2f6bff',weight:1,opacity:.5,fillColor:'#2f6bff',fillOpacity:.12,interactive:false}).addTo(state.map) : null;
    state.userMarker = L.marker([lat,lon],{icon:L.divIcon({className:'pluvia-user-dot',iconSize:[22,22],html:'<span></span>'}),keyboard:false,zIndexOffset:1000}).addTo(state.map).bindTooltip('Você está aqui');
    return true;
  }
  function recenter() {
    const selectedCity = city(); if (!state.map || !selectedCity) return;
    const button = $('weatherMapRecenter'), attempt = ++locating;
    if (!globalThis.navigator?.geolocation) { centerOn([selectedCity.lat,selectedCity.lon],7); return; }
    button?.setAttribute('aria-busy','true');
    const done = message => {
      if (attempt !== locating) return;
      button?.removeAttribute('aria-busy');
      if (message) frameStatus(false,message);
    };
    navigator.geolocation.getCurrentPosition(position => {
      if (attempt !== locating || !state.map) return;
      if (showUser(position)) { centerOn([state.user.lat,state.user.lon],9); done('Mapa centralizado na sua localização.'); }
      else { centerOn([selectedCity.lat,selectedCity.lon],7); done(`Localização inválida; mapa centralizado em ${selectedCity.name}.`); }
    },error => {
      if (attempt !== locating || !state.map) return;
      const current = city() || selectedCity;
      // Uma posição já mostrada continua valendo; sem ela, volta ao município.
      centerOn(recenterTarget() || [current.lat,current.lon],state.user ? 9 : 7);
      done(state.user ? null : error?.code === 1 ? `Localização não permitida; mapa centralizado em ${current.name}.` : `Localização indisponível agora; mapa centralizado em ${current.name}.`);
    },{enableHighAccuracy:true,timeout:10000,maximumAge:30000});
  }
  // Na Home o radar é uma miniatura parada (sem arrastar/zoom, sem player); tocar abre o radar ampliado,
  // onde o mapa volta a ser interativo. Assim a rolagem da página nunca fica presa no mapa.
  function setInteractive(on) {
    const map = state.map; if (!map) return;
    for (const handler of ['dragging','touchZoom','doubleClickZoom','scrollWheelZoom','boxZoom','keyboard']) map[handler]?.[on ? 'enable' : 'disable']?.();
  }
  async function initMap() {
    await loadLeaflet();
    const selectedCity = city(); if (!selectedCity) throw new Error('Escolha uma cidade para ver o mapa.');
    if (!state.map) {
      state.map = L.map('weatherMap',{zoomControl:true,minZoom:3,maxZoom:11}).setView([selectedCity.lat,selectedCity.lon],7);
      state.base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{className:'pluvia-light-basemap',maxZoom:19,attribution:'© OpenStreetMap'}).addTo(state.map);
      state.map.on?.('moveend zoomend resize',updateRecenter);
      setInteractive(Boolean(radarDialog?.open));
    } else state.map.setView([selectedCity.lat,selectedCity.lon],7);
    if (state.marker) state.map.removeLayer(state.marker);
    state.marker = L.circleMarker([selectedCity.lat,selectedCity.lon],{radius:7,color:'#fff',weight:3,fillColor:'#2f6bff',fillOpacity:1}).addTo(state.map).bindTooltip(`${selectedCity.name}/${selectedCity.uf}`);
    state.cityId = selectedCity.id; $('weatherMapCity').textContent = `${selectedCity.name}/${selectedCity.uf} · ponto de referência do município`;
    const recenterButton = $('weatherMapRecenter');
    if (recenterButton) { recenterButton.hidden = false; recenterButton.setAttribute('aria-label','Mostrar minha localização no mapa'); recenterButton.title = 'Minha localização'; }
    updateRecenter();
    resizeMap();
  }
  let initializing = false;
  let mapVisible = false;
  async function showMap() {
    if (initializing || !city()) return;
    let initialized = false;
    initializing = true; setError('');frameStatus(true,'Abrindo mapa…');
    try {
      await initMap();
      initialized = true;
      await selectLayer(state.layer);
      globalThis.pluviaAnalytics?.track('Weather Map Viewed',{layer:state.layer,city:city()?.name,uf:city()?.uf});
    } catch (error) { setError(error?.message || 'Não foi possível carregar o mapa agora.');frameStatus(false,'Mapa indisponível.',true); }
    finally {
      initializing = false;
      if (initialized && state.map && city()?.id !== state.cityId && (mapVisible || radarDialog?.open)) showMap();
    }
  }
  function step(amount) { if (!state.frames.length || state.nextOverlay) return; state.index = (state.index + amount + state.frames.length) % state.frames.length; renderFrame(); }
  function resizeMap() {
    if (resizePending) return;
    resizePending=true;
    requestAnimationFrame(()=>{
      resizePending=false;const container=state.map?.getContainer?.();if (!container) return;
      const {clientWidth:width,clientHeight:height}=container;
      if (!width || !height || (lastSize.width===width && lastSize.height===height)) return;
      lastSize.width=width;lastSize.height=height;state.map.invalidateSize({pan:true}); // mantém o mesmo centro ao ampliar/reduzir o radar
    });
  }
  $('weatherMapRetry')?.addEventListener('click',()=>{
    setError('');
    if (!state.map) showMap();else if (state.frames.length) renderFrame(true);else selectLayer(state.layer);
  });
  $('weatherMapRecenter')?.addEventListener('click',recenter);
  $('radarStageOpen')?.addEventListener('click',() => $('expandRadar')?.click());
  $('expandRadar')?.addEventListener('click',() => {
    if (!radarDialog || radarDialog.open || !radarContent) return;
    previousOverflow = document.body.style.overflow;
    $('radarDialogContent').appendChild(radarContent);
    radarDialog.showModal(); document.body.style.overflow='hidden';
    setInteractive(true);
    mapVisible=true; if (!state.map || state.cityId !== city()?.id) showMap();
    resizeMap(); $('closeRadar').focus();
  });
  $('closeRadar')?.addEventListener('click',() => globalThis.PLUVIA?.dialogs?.close(radarDialog) ?? radarDialog.close());
  radarDialog?.addEventListener('close',() => {
    stop(); radarHome?.appendChild(radarContent); document.body.style.overflow=previousOverflow;
    setInteractive(false);
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
    ['MET Norway','Previsão meteorológica','Fonte principal de temperatura, vento e precipitação. Quando indisponível, usamos Open-Meteo. Dados CC BY 4.0.'],
    ['RainViewer','Observação de radar','Composição de radares; cobertura e disponibilidade variam por região.'],
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
      ['Raios detectados por satélite · NOAA','https://www.star.nesdis.noaa.gov/goes/']
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
