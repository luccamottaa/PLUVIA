(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.weatherShare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const CANONICAL = 'https://pluviaweather.com.br/';
  const MAX_CURRENT_AGE_MS = 30 * 60 * 1000;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const format = value => finite(value) ? Math.round(value).toLocaleString('pt-BR') : '—';
  function cityIdFromURL(value) {
    try {
      const id = new URL(value, CANONICAL).searchParams.get('city');
      return /^\d{7}$/.test(id || '') ? id : null;
    } catch { return null; }
  }
  function cityURL(id) {
    const url = new URL(CANONICAL);
    if (/^\d{7}$/.test(String(id || ''))) url.searchParams.set('city', String(id));
    return url.href;
  }
  function localReading(time, timezone) {
    if (typeof time !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(time)) return null;
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(time)) return { day:time.slice(0,10), clock:time.slice(11,16) };
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone:timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
      }).formatToParts(new Date(time)).map(part => [part.type,part.value]));
      return { day:parts.year+'-'+parts.month+'-'+parts.day, clock:parts.hour+':'+parts.minute };
    } catch { return null; }
  }
  function createModel(snapshot, options = {}) {
    if (!snapshot?.location?.id || !snapshot.location.name || !finite(snapshot.current?.temperature)) return null;
    const { location, current, source = {} } = snapshot;
    const reading = localReading(current.time, location.timezone);
    const now = options.now ?? Date.now();
    const age = finite(options.dataAt) ? now - options.dataAt : null;
    const checkedAge = finite(source.checkedAt) ? now - source.checkedAt : null;
    const stale = options.stale === true || source.freshness === 'stale' ||
      (age !== null && (age > MAX_CURRENT_AGE_MS || age < -5 * 60 * 1000)) ||
      (checkedAge !== null && checkedAge > MAX_CURRENT_AGE_MS);
    // Match the date of the current reading, never reuse another day's extremes.
    const day = snapshot.daily?.find(item => item.time === reading?.day);
    const icons = options.icons;
    const hasCode = finite(current.weatherCode) && (!icons?.CONDITIONS || Object.hasOwn(icons.CONDITIONS,current.weatherCode));
    const condition = hasCode ? icons?.condition(current.weatherCode)?.label || 'Condição prevista' : 'Condição indisponível';
    const icon = hasCode ? icons?.icon(current.weatherCode, current.isDay !== false)?.src : null;
    const date = reading ? reading.day.split('-').reverse().join('/') : 'Horário indisponível';
    const model = {
      city:location.name+(location.region ? ' / '+location.region : ''),
      id:location.id, temperature:format(current.temperature)+'°C', condition, icon,
      isDay:current.isDay !== false, stale,
      timing:reading ? date+' às '+reading.clock+' · horário local' : date,
      status:stale ? 'Dados salvos ou desatualizados · sem confirmação atual' : 'Condição atual estimada por modelo',
      metrics:[
        { label:'Sensação', value:finite(current.apparentTemperature) ? format(current.apparentTemperature)+'°C' : '—' },
        { label:'Máxima prevista', value:finite(day?.temperatureMax) ? format(day.temperatureMax)+'°C' : '—' },
        { label:'Mínima prevista', value:finite(day?.temperatureMin) ? format(day.temperatureMin)+'°C' : '—' },
        { label:'Chance de chuva no dia', value:finite(day?.precipitationProbabilityMax) && day.precipitationProbabilityMax >= 0 && day.precipitationProbabilityMax <= 100 ? format(day.precipitationProbabilityMax)+'%' : '—' }
      ],
      source:source.weather === 'met-norway+open-meteo' ? 'MET Norway + Open-Meteo' : source.weather === 'open-meteo' ? 'Open-Meteo' : 'Fonte indisponível',
      url:cityURL(location.id),
      filename:'pluvia-'+String(location.id).replace(/[^\d]/g,'')+'.png'
    };
    model.text = [
      'PLUVIA · '+model.city, model.temperature+' · '+condition,
      ...model.metrics.filter(metric => metric.value !== '—').map(metric => metric.label+': '+metric.value),
      model.timing, model.status, 'Previsão meteorológica · '+model.source, model.url
    ].join('\n');
    return model;
  }
  function sharePayload(model, file, navigator) {
    const payload = { title:'Clima em '+model.city+' · PLUVIA', text:model.text };
    try { if (file && navigator.canShare?.({files:[file]})) payload.files = [file]; } catch {}
    return payload;
  }
  function loadImage(root, src) {
    if (!src) return Promise.resolve(null);
    return new Promise(resolve => {
      const image = new root.Image();
      const timer = root.setTimeout(() => finish(null), 3000);
      function finish(value) {
        root.clearTimeout(timer);
        image.onload = image.onerror = null;
        resolve(value);
      }
      image.onload = () => finish(image);
      image.onerror = () => finish(null);
      image.src = src;
    });
  }
  async function renderCard(root, model) {
    const canvas = root.document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Imagem indisponível');
    const [icon, logo] = await Promise.all([loadImage(root, model.icon), loadImage(root, './logo-mark.png')]);
    const background = ctx.createLinearGradient(0,0,1080,1350);
    background.addColorStop(0, model.isDay ? '#164879' : '#102d52');
    background.addColorStop(1, '#07182e');
    ctx.fillStyle = background; ctx.fillRect(0,0,1080,1350);
    ctx.fillStyle = '#ffffff08'; ctx.beginPath(); ctx.arc(1000,260,350,0,Math.PI*2); ctx.fill();
    const text = (value, x, y, size, color = '#f1f7ff', maxWidth = 936, weight = 600) => {
      ctx.fillStyle = color; ctx.font = weight+' '+size+'px system-ui, sans-serif'; ctx.fillText(value,x,y,maxWidth);
    };
    if (logo) ctx.drawImage(logo,72,66,66,66);
    text('PLUVIA',logo ? 156 : 72,115,42,'#f1f7ff',820,800);
    text('O céu de cada cidade.',72,195,28,'#b9d7f3');
    text(model.city,72,305,58,'#f1f7ff',936,800);
    text(model.stale ? 'LEITURA ANTERIOR' : 'CONDIÇÃO ATUAL ESTIMADA',72,365,23,'#b9d7f3');
    text(model.temperature,60,575,180,'#ffffff',690,700);
    if (icon) ctx.drawImage(icon,782,415,220,220);
    text(model.condition,72,674,42);
    model.metrics.forEach((metric,index) => {
      const x = 72+(index%2)*480, y = 754+Math.floor(index/2)*144;
      ctx.fillStyle = '#ffffff0c';
      ctx.beginPath(); ctx.roundRect(x,y,456,124,22); ctx.fill();
      text(metric.label,x+24,y+37,23,'#b9d7f3',408);
      text(metric.value,x+24,y+95,46);
    });
    text(model.timing,72,1096,26,'#b9d7f3');
    text(model.stale ? 'Sem confirmação atual · dados salvos ou desatualizados' : 'Previsão meteorológica · valores de modelo',72,1140,23,model.stale ? '#ffd596' : '#b9d7f3');
    text('Fonte: '+model.source,72,1192,25,'#b9d7f3');
    text('pluviaweather.com.br',72,1273,32,'#f1f7ff',936,700);
    return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Imagem indisponível')), 'image/png'));
  }
  function mount(root, getModel) {
    const doc = root.document, el = id => doc.getElementById(id);
    const dialog = el('weatherShareDialog'), trigger = el('openWeatherShare');
    if (!dialog || !trigger) return;
    let generation = 0, model = null, file = null, previewURL = null, busy = false;
    const native = el('weatherShareNative'), save = el('weatherShareSave');
    const status = message => { el('weatherShareStatus').textContent = message; };
    function release() {
      generation++; model = null; file = null; busy = false;
      if (previewURL) root.URL.revokeObjectURL(previewURL);
      previewURL = null;
      el('weatherSharePreview').removeAttribute('src');
      el('weatherSharePreview').hidden = true;
      save.disabled = true;
    }
    function available() {
      const current = getModel();
      trigger.disabled = !current;
      trigger.title = current ? 'Compartilhar o clima de '+current.city : 'Aguarde os dados do clima';
    }
    function actions() {
      native.hidden = typeof root.navigator.share !== 'function';
      native.disabled = busy;
      el('weatherShareCopy').disabled = busy;
      save.disabled = !previewURL || busy;
    }
    async function open() {
      if (busy) return;
      const next = getModel();
      if (!next) { available(); return; }
      release(); model = next;
      const token = generation;
      el('weatherShareText').value = model.text;
      el('weatherShareText').hidden = true;
      el('weatherSharePreview').alt = model.text;
      el('weatherShareWhatsApp').href = 'https://wa.me/?text='+encodeURIComponent(model.text);
      native.textContent = 'Compartilhar texto';
      status('Preparando o cartão…'); actions();
      dialog.showModal();
      try {
        const blob = await renderCard(root, model);
        if (generation !== token || !dialog.open) return;
        previewURL = root.URL.createObjectURL(blob);
        file = typeof root.File === 'function' ? new root.File([blob],model.filename,{type:'image/png'}) : null;
        el('weatherSharePreview').src = previewURL;
        el('weatherSharePreview').hidden = false;
        native.textContent = sharePayload(model,file,root.navigator).files ? 'Compartilhar cartão' : 'Compartilhar texto';
        actions();
        status(model.stale ? 'A leitura anterior está identificada no cartão.' : 'Cartão pronto. Escolha como compartilhar.');
      } catch {
        if (generation !== token || !dialog.open) return;
        el('weatherShareText').hidden = false;
        status('A imagem não ficou disponível. Você pode compartilhar o texto.');
      }
    }
    trigger.addEventListener('click',open);
    el('weatherShareClose').addEventListener('click',() => dialog.close());
    dialog.addEventListener('close',() => { release(); available(); trigger.focus(); });
    native.addEventListener('click',async () => {
      if (!model || busy) return;
      const token = generation;
      busy = true; actions();
      try {
        // The PNG is already prepared: share() runs directly in the user gesture.
        await root.navigator.share(sharePayload(model,file,root.navigator));
        if (token === generation) status('Compartilhamento aberto.');
      } catch(error) {
        if (token !== generation) return;
        if (error?.name !== 'AbortError') {
          file = null; native.textContent = 'Compartilhar texto';
          status('Não foi possível compartilhar. Tente o texto, WhatsApp ou salvar a imagem.');
        }
      } finally { if (token === generation) { busy = false; actions(); } }
    });
    el('weatherShareCopy').addEventListener('click',async () => {
      if (!model || busy) return;
      const token = generation;
      busy = true; actions();
      try {
        if (!root.navigator.clipboard?.writeText) throw new Error('Área de transferência indisponível');
        await root.navigator.clipboard.writeText(model.text);
        if (token === generation) status('Texto copiado.');
      } catch {
        if (token !== generation) return;
        el('weatherShareText').hidden = false;
        el('weatherShareText').focus(); el('weatherShareText').select();
        status('Selecione e copie o texto abaixo.');
      } finally { if (token === generation) { busy = false; actions(); } }
    });
    save.addEventListener('click',() => {
      if (!previewURL || !model || busy) return;
      const link = doc.createElement('a');
      link.href = previewURL; link.download = model.filename;
      doc.body.appendChild(link); link.click(); link.remove();
      status('Imagem pronta para salvar.');
    });
    root.addEventListener('pluvia:city-changed',() => {
      if (dialog.open) dialog.close();
      release(); available();
    });
    root.addEventListener('pluvia:weather-status-changed',() => {
      if (dialog.open) dialog.close();
      available();
    });
    root.addEventListener('pluvia:weather-updated',() => {
      // Invalidate an open card rather than sharing a previous refresh.
      if (dialog.open) dialog.close();
      available();
    });
    available();
  }
  return { cityIdFromURL, cityURL, createModel, sharePayload, renderCard, mount };
});
