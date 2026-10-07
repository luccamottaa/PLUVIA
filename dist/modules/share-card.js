/* Imagem de story (1080×1920) para compartilhar a previsão: céu do dia ou da noite, a gota PLUVIA,
   cidade, temperatura, condição, "Vai chover?", sensação e máx./mín., horário local e fonte.
   `model` é puro (testável em CommonJS); `render` desenha num canvas e devolve um PNG.
   Sem coordenadas, conta ou dados pessoais: só o que já aparece na tela. */
(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports
    ? {time:require('./city-time.js'), insights:require('./weather-insights.js')}
    : {get time() {return root.PLUVIA?.time;}, get insights() {return root.PLUVIA?.weatherInsights;}});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).shareCard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(deps) {
  'use strict';
  const WIDTH = 1080, HEIGHT = 1920;
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

  // Conteúdo do card a partir do snapshot normalizado (mesmas regras da Home: i+1 para chuva,
  // dia municipal para máx./mín., ausentes nunca viram zero). Leitura com mais de 36 h: nada.
  function model(snapshot, {condition = 'Condição prevista', night = false, now = Date.now()} = {}) {
    const city = snapshot?.location, current = snapshot?.current, checked = snapshot?.source?.checkedAt;
    if (!city?.id || !city.timezone || finite(current?.temperature) === null || !Number.isFinite(checked) || now < checked || now - checked > 36 * 3600000) return null;
    const at = deps.time?.parse(current.time, city);
    if (!Number.isFinite(at)) return null;
    const forecast = snapshot.raw?.forecast, hourly = forecast?.hourly, daily = forecast?.daily;
    const start = hourly?.time?.length ? deps.time.hourIndex(hourly.time, city, now) : -1;
    const rain = start >= 0 ? deps.insights?.rainAnswer?.(hourly, start, {current:forecast.current}) : null;
    const day = deps.time.dayKey(now, city), index = daily?.time?.indexOf(day) ?? -1;
    const saved = snapshot.source.freshness === 'stale' || now - checked > 5 * 60000 || now - at > 90 * 60000;
    const stamp = new Intl.DateTimeFormat('pt-BR', {timeZone:city.timezone, weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}).format(new Date(at));
    return {
      city:`${city.name}/${city.region}`,
      temperature:Math.round(current.temperature),
      condition,
      code:finite(current.weatherCode),
      feels:finite(current.apparentTemperature) === null ? null : Math.round(current.apparentTemperature),
      high:index >= 0 && finite(daily.temperature_2m_max?.[index]) !== null ? Math.round(daily.temperature_2m_max[index]) : null,
      low:index >= 0 && finite(daily.temperature_2m_min?.[index]) !== null ? Math.round(daily.temperature_2m_min[index]) : null,
      rain:rain?.text && rain.tone !== 'unknown' ? rain.text : null,
      night:Boolean(night),
      stamp:`${saved ? 'Leitura salva de' : 'Atualizado em'} ${stamp} · horário local`,
      source:snapshot.source.weather === 'met-norway+open-meteo' ? 'Previsão por modelos · MET Norway / Open-Meteo' : 'Previsão por modelos · Open-Meteo'
    };
  }

  function loadImage(doc, src) {
    return new Promise(resolve => {
      const image = new (doc.defaultView?.Image || Image)();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }
  // Quebra o texto em até `lines` linhas na largura dada; a última recebe reticências se faltar espaço.
  function wrap(ctx, text, width, lines = 2) {
    const words = String(text || '').split(/\s+/).filter(Boolean), out = [];
    let line = '';
    for (const word of words) {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width <= width || !line) line = next;
      else {out.push(line); line = word;}
    }
    if (line) out.push(line);
    if (out.length > lines) {
      const kept = out.slice(0, lines);
      let last = kept[lines - 1];
      while (last && ctx.measureText(last + '…').width > width) last = last.slice(0, -1);
      kept[lines - 1] = last.trimEnd() + '…';
      return kept;
    }
    return out;
  }

  async function render(data, {document:doc = globalThis.document} = {}) {
    if (!data || !doc?.createElement) return null;
    const canvas = doc.createElement('canvas');
    canvas.width = WIDTH; canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof canvas.toBlob !== 'function') return null;
    try { await Promise.all(['300 300px Inter', '500 48px Inter', '600 72px Inter', '900 64px Nunito'].map(font => doc.fonts?.load?.(font))); } catch {}
    const icons = doc.defaultView?.PLUVIA?.weatherIcons;
    const iconName = data.code === null ? null : icons?.icon?.(data.code, !data.night)?.src || null;
    const [icon, mark] = await Promise.all([
      iconName ? loadImage(doc, iconName) : null,
      loadImage(doc, '/logo-mark.png')
    ]);
    const ink = data.night ? '#f1f7ff' : '#0f2a44', muted = data.night ? '#b9cbe3' : '#2d4a66';
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    if (data.night) {sky.addColorStop(0, '#10233f'); sky.addColorStop(1, '#080f22');}
    else {sky.addColorStop(0, '#5fb0f2'); sky.addColorStop(1, '#cfe9fa');}
    ctx.fillStyle = sky; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // Assinatura: gota recolorida (azul da marca de dia, gota clara à noite) e o nome em Nunito.
    const brand = data.night ? '#7aa5ff' : '#2f6bff';
    if (mark) {
      const tint = doc.createElement('canvas'); tint.width = 96; tint.height = 96;
      const t = tint.getContext('2d');
      t.drawImage(mark, 0, 0, 96, 96); t.globalCompositeOperation = 'source-in'; t.fillStyle = brand; t.fillRect(0, 0, 96, 96);
      ctx.drawImage(tint, WIDTH / 2 - 150, 132, 72, 72);
    }
    ctx.fillStyle = brand; ctx.font = '900 64px Nunito, Inter, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('PLUVIA', WIDTH / 2 - 66, 192);
    ctx.textAlign = 'center';
    ctx.fillStyle = ink; ctx.font = '600 84px Inter, sans-serif';
    // Bloco central um pouco abaixo do meio-alto: equilibra com a fonte no rodapé e foge da barra do story.
    const top = 110;
    ctx.fillText(wrap(ctx, data.city, 940, 1)[0], WIDTH / 2, 420 + top);
    if (icon) ctx.drawImage(icon, WIDTH / 2 - 150, 470 + top, 300, 300);
    ctx.font = '300 300px Inter, sans-serif';
    ctx.fillText(`${data.temperature}°`, WIDTH / 2 + 40, 1060 + top);
    ctx.font = '500 60px Inter, sans-serif';
    let y = 1170 + top;
    for (const line of wrap(ctx, data.condition, 940, 2)) {ctx.fillText(line, WIDTH / 2, y); y += 74;}
    ctx.fillStyle = muted; ctx.font = '400 46px Inter, sans-serif';
    const details = [data.feels === null ? null : `Sensação ${data.feels}°`, data.high === null || data.low === null ? null : `Máx. ${data.high}° · Mín. ${data.low}°`].filter(Boolean).join('   ·   ');
    if (details) {ctx.fillText(details, WIDTH / 2, y + 20); y += 96;}
    if (data.rain) {
      ctx.fillStyle = ink; ctx.font = '500 48px Inter, sans-serif';
      for (const line of wrap(ctx, data.rain, 900, 3)) {ctx.fillText(line, WIDTH / 2, y + 40); y += 62;}
    }
    ctx.fillStyle = muted; ctx.font = '400 36px Inter, sans-serif';
    ctx.fillText(data.stamp, WIDTH / 2, 1700);
    ctx.fillText(data.source, WIDTH / 2, 1752);
    ctx.fillStyle = brand; ctx.font = '600 40px Inter, sans-serif';
    ctx.fillText('pluviaweather.com.br', WIDTH / 2, 1830);
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/png'));
  }

  return {model, render, wrap, WIDTH, HEIGHT};
});
