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
  const BADGES = {storm:'Dia de trovoada', glow:'Pôr do sol promete hoje'};
  const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

  // Conteúdo do card a partir do snapshot normalizado (mesmas regras da Home: i+1 para chuva,
  // dia municipal para máx./mín., ausentes nunca viram zero). Leitura com mais de 36 h: nada.
  function model(snapshot, {condition = 'Condição prevista', night = false, solar = 'none', now = Date.now(), moment = null} = {}) {
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
      // Pôr/nascer do sol (a mesma janela do céu da Home, data-solar): outro valor vira 'none'.
      solar:solar === 'sunrise' || solar === 'sunset' ? solar : 'none',
      // Dia marcante (o mesmo convite da Home): selo no topo do story. Outro valor não vira selo.
      badge:Object.hasOwn(BADGES, String(moment)) ? BADGES[moment] : null,
      stamp:`${saved ? 'Leitura salva de' : 'Atualizado em'} ${stamp} · horário local`,
      source:snapshot.source.weather === 'met-norway' ? 'Previsão reduzida · MET Norway (CC BY 4.0)' : snapshot.source.weather === 'met-norway+open-meteo' ? 'Previsão por modelos · MET Norway / Open-Meteo' : 'Previsão por modelos · Open-Meteo'
    };
  }

  // Céu do story pela condição, como na Home: azul limpo, prata no nublado, cinza-chumbo na chuva e na trovoada
  // (de dia com texto claro), azul-noite ou cinza-escuro à noite. `clouds` é a opacidade das nuvens (0 = sem).
  // Pôr e nascer do sol (1.31.1, pedido do usuário): com céu limpo ou parcial, degradê de crepúsculo (azul-noite em
  // cima, violeta, rosa e laranja no horizonte) e nuvens tingidas de rosa; texto claro e rodapé creme. No lado
  // da noite a luz é mais fraca. Chuva, trovoada e nublado continuam com o céu da condição.
  function skyLook(code, night, solar = 'none') {
    const c = finite(code);
    const kind = c === null ? 'clear' : c >= 95 ? 'storm' : (c >= 51 && c <= 67) || (c >= 80 && c <= 82) ? 'rain' : c === 3 || c === 45 || c === 48 ? 'cloud' : c === 1 || c === 2 ? 'partly' : c >= 71 && c <= 86 ? 'cloud' : 'clear';
    if ((solar === 'sunrise' || solar === 'sunset') && (kind === 'clear' || kind === 'partly')) return night
      ? {sky:[[0, '#141c3d'], [.55, '#3b3566'], [.82, '#7a4c72'], [1, '#c0735f']], clouds:kind === 'partly' ? .7 : 0, tint:'rgba(150,100,140,.55)', light:true, twilight:true}
      : {sky:[[0, '#25346a'], [.5, '#6a5590'], [.78, '#c46f84'], [1, '#f4a463']], clouds:kind === 'partly' ? .9 : 0, tint:'rgba(255,170,150,.38)', light:true, twilight:true};
    if (night) return kind === 'rain' || kind === 'storm'
      ? {sky:['#24282e', '#15171b'], clouds:.9, tint:'rgba(70,76,86,.82)', light:true}
      : {sky:['#10233f', '#080f22'], clouds:kind === 'clear' ? 0 : kind === 'partly' ? .55 : .75, tint:'rgba(52,62,96,.8)', light:true};
    if (kind === 'rain' || kind === 'storm') return {sky:['#3b434c', '#57606a'], clouds:1, tint:'rgba(96,104,114,.7)', light:true};
    if (kind === 'cloud') return {sky:['#8796aa', '#9eabbc'], clouds:1, tint:null, light:false};
    return {sky:['#5fb0f2', '#cfe9fa'], clouds:kind === 'partly' ? 1 : 0, tint:null, light:false};
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
    const look = skyLook(data.code, data.night, data.solar);
    const [icon, mark, veil] = await Promise.all([
      iconName ? loadImage(doc, iconName) : null,
      loadImage(doc, '/logo-mark.png?v=logo-5'),
      look.clouds ? loadImage(doc, '/assets/sky-cloud-veil.webp?v=clouds-9') : null
    ]);
    const ink = look.light ? '#f1f7ff' : '#0f2a44', muted = look.twilight ? '#fff1e6' : look.light ? '#b9cbe3' : '#2d4a66';
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    look.sky.forEach((stop, i) => Array.isArray(stop) ? sky.addColorStop(stop[0], stop[1]) : sky.addColorStop(i ? 1 : 0, stop));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // Nuvens do próprio céu do app (1.31): a mesma textura do véu, tingida pela condição numa tela à parte
    // (source-atop pinta só onde há nuvem) e desenhada no alto do story. Sem a imagem, fica só o degradê.
    if (veil) {
      const layer = doc.createElement('canvas'), h = 760;
      layer.width = WIDTH; layer.height = h;
      const lc = layer.getContext('2d');
      if (lc) {
        lc.drawImage(veil, -260, 0, h * 3, h);
        if (look.tint) {lc.globalCompositeOperation = 'source-atop'; lc.fillStyle = look.tint; lc.fillRect(0, 0, WIDTH, h);}
        // A textura não chega a zero embaixo: sem esse esmaecimento o fim da camada virava uma linha reta.
        const fade = lc.createLinearGradient(0, 0, 0, h);
        fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(.55, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
        lc.globalCompositeOperation = 'destination-in'; lc.fillStyle = fade; lc.fillRect(0, 0, WIDTH, h);
        ctx.globalAlpha = look.clouds; ctx.drawImage(layer, 0, 40); ctx.globalAlpha = 1;
        layer.width = layer.height = 0;
      }
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // Nome na cor do texto; o azul da marca
    // fica no selo do dia marcante.
    const brand = look.twilight ? '#ffffff' : look.light ? '#b7d2ff' : '#2f557f';
    // Marca nova (1.26): a logo colorida, desenhada como está (antes era uma gota pintada de uma cor só).
    if (mark) ctx.drawImage(mark, WIDTH / 2 - 160, 124, 88, 88);
    ctx.fillStyle = ink; ctx.font = '900 64px Nunito, Inter, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('PLUVIA', WIDTH / 2 - 66, 192);
    ctx.textAlign = 'center';
    if (data.badge) {
      ctx.font = '600 44px Inter, sans-serif';
      const width = ctx.measureText(data.badge).width + 88, x = (WIDTH - width) / 2, y = 268, h = 84;
      ctx.fillStyle = brand; ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, width, h, h / 2); else ctx.rect(x, y, width, h);
      ctx.fill();
      ctx.fillStyle = look.light ? '#0b1830' : '#ffffff'; ctx.fillText(data.badge, WIDTH / 2, y + 57);
    }
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
    // Depois do PNG pronto, o bitmap de 1080×1920 (~8 MB) é liberado: no iPhone essa memória pesa.
    return new Promise(resolve => canvas.toBlob(blob => { canvas.width = canvas.height = 0; resolve(blob); }, 'image/png'));
  }

  return {model, render, wrap, skyLook, WIDTH, HEIGHT};
});
