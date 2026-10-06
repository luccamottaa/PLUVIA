(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./city-time.js') : root.PLUVIA?.time);
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.weatherInsights = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (time) {
  "use strict";

  const finite = value => typeof value === "number" && Number.isFinite(value);
  const number = value => finite(value) ? Number(value) : null;
  const round = (value, digits = 0) => {
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
  };
  const clock = value => String(value || "").slice(11, 16);
  const day = value => String(value || "").slice(0, 10);
  const normalizedLabel = value => String(value || "").trim().toLocaleLowerCase("pt-BR");

  function uniqueHighlights(labels = [], existing = [], limit = 3) {
    const seen = new Set(existing.map(normalizedLabel).filter(Boolean));
    const result = [];
    for (const label of labels) {
      const key = normalizedLabel(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(label);
      if (result.length >= limit) break;
    }
    return result;
  }

  function currentIndex(hourly, requested) {
    const times = hourly?.time || [];
    if (!times.length) return -1;
    if (Number.isInteger(requested) && requested >= 0 && requested < times.length) return requested;
    const exact = times.indexOf(requested);
    if (exact >= 0) return exact;
    const now = String(requested || "");
    let found = -1;
    for (let index = 0; index < times.length; index += 1) {
      if (String(times[index]) <= now) found = index;
      else break;
    }
    return found >= 0 ? found : 0;
  }

  function yesterday(hourly, start) {
    if (!hourly?.time?.[start] || !finite(hourly.temperature_2m?.[start])) return null;
    const targetHour = clock(hourly.time[start]);
    const currentDay = day(hourly.time[start]);
    let previousDay = "";
    try {
      const date = new Date(currentDay + "T12:00:00Z");
      date.setUTCDate(date.getUTCDate() - 1);
      previousDay = date.toISOString().slice(0, 10);
    } catch {
      return null;
    }
    const previous = hourly.time.findIndex(value => day(value) === previousDay && clock(value) === targetHour);
    if (previous < 0 || !finite(hourly.temperature_2m?.[previous])) return null;
    const delta = round(Number(hourly.temperature_2m[start]) - Number(hourly.temperature_2m[previous]), 1);
    const abs = Math.abs(delta).toLocaleString("pt-BR", {maximumFractionDigits:1});
    if (Math.abs(delta) < 0.2) return {delta, text:"Temperatura semelhante à de ontem neste horário."};
    return {
      delta,
      text: delta > 0
        ? `${abs} °C mais quente que ontem neste horário.`
        : `${abs} °C mais fresco que ontem neste horário.`
    };
  }

  function feelsLike(current) {
    const temperature = number(current?.temperature_2m);
    const apparent = number(current?.apparent_temperature);
    if (temperature === null || apparent === null) return null;
    const humidity = number(current?.relative_humidity_2m);
    const wind = number(current?.wind_speed_10m);
    const gap = apparent - temperature;
    if (gap >= 3 && temperature >= 26 && humidity !== null && humidity >= 65) {
      return {label:"Elevada pelo calor e pela umidade.", reason:"A umidade reduz a eficiência do suor e eleva a sensação térmica."};
    }
    if (gap >= 2) return {label:"Acima da temperatura medida.", reason:"A sensação prevista está acima da temperatura; ela considera umidade, vento e radiação."};
    if (gap <= -2 && wind !== null && wind >= 15) {
      return {label:"Mais baixa por causa do vento.", reason:"O vento favorece a perda de calor e reduz a sensação térmica."};
    }
    if (gap <= -2) return {label:"Abaixo da temperatura medida.", reason:"A sensação prevista está abaixo da temperatura; os dados não isolam uma única causa."};
    return {label:"Próxima da temperatura medida.", reason:"Temperatura e sensação térmica estão próximas neste momento."};
  }

  function uv(hourly, start) {
    const times = hourly?.time || [];
    if (start < 0 || !times[start]) return null;
    const localDay = day(times[start]);
    const points = times.flatMap((stamp, index) => {
      if (day(stamp) !== localDay) return [];
      const raw = number(hourly.uv_index?.[index]);
      const value = raw !== null && raw >= 0 ? raw : null;
      return [{time:clock(stamp),value,index}];
    });
    const known = points.filter(point => point.value !== null);
    if (!known.length) return null;
    const peak = Math.max(...known.map(point => point.value));
    const peaks = known.filter(point => point.value === peak);
    const first = peaks[0], last = peaks[peaks.length - 1];
    const complete = points.length === 24 && points.every((point,i) => point.value !== null && point.time === String(i).padStart(2,'0')+':00');
    const past = last.index < start;
    const level = peak >= 11 ? "extremo" : peak >= 8 ? "muito alto" : peak >= 6 ? "alto" : peak >= 3 ? "moderado" : "baixo";
    return {
      peak:round(peak, 1),
      time:first.time, points, complete, past, level,
      label: peak===0 ? `${complete ? 'UV baixo ao longo do dia' : 'UV baixo nos horários disponíveis'}.` : `${complete ? '' : 'Dados parciais · '}Pico ${level} ${past ? 'do dia estimado' : 'previsto'} por volta de ${first.time}${first.time !== last.time ? '–'+last.time : ''}${past ? ' (horário já passou)' : ''}.`
    };
  }

  function pressure(hourly, start, city) {
    if (!Number.isInteger(start) || start < 3) return null;
    const now = number(hourly?.pressure_msl?.[start]), past = number(hourly?.pressure_msl?.[start-3]);
    const parse = value => city ? time?.parse(value,city) : time?.wallTime(value);
    if (now === null || past === null || parse(hourly.time?.[start])-parse(hourly.time?.[start-3]) !== 3*3600000) return null;
    const delta = round(now-past,1);
    return {delta,trend:Math.abs(delta)<.8 ? 'stable' : delta>0 ? 'rising' : 'falling'};
  }

  // Faixas de umidade relativa usadas pela Defesa Civil (referência OMS). Valores ausentes não viram ar seco.
  const HUMIDITY_LEVELS = [
    [12, "emergency", "Emergência: ar extremamente seco"],
    [20, "alert", "Alerta: ar muito seco"],
    [30, "attention", "Atenção: ar seco"],
    [50, "dry", "Ar mais seco"],
    [70, "comfortable", "Faixa confortável"],
    [85, "high", "Umidade alta"],
    [Infinity, "very-high", "Umidade muito alta"]
  ];
  const humidityValue = value => finite(value) && value >= 0 && value <= 100 ? Number(value) : null;
  function humidityLevel(value) {
    const reading = humidityValue(value);
    if (reading === null) return null;
    const [, level, label] = HUMIDITY_LEVELS.find(([limit]) => reading < limit);
    return {level, label};
  }

  // Leitura atual + hora mais seca que ainda resta no dia municipal (umidade é instantânea: sem deslocar índice).
  function humidity(hourly, start, current) {
    const now = humidityValue(current?.relative_humidity_2m);
    const classification = humidityLevel(now);
    const times = hourly?.time || [];
    let driest = null;
    if (Number.isInteger(start) && start >= 0 && start < times.length) {
      const today = day(times[start]);
      for (let index = start; index < times.length && day(times[index]) === today; index += 1) {
        const value = humidityValue(hourly?.relative_humidity_2m?.[index]);
        if (value !== null && (!driest || value < driest.value)) driest = {value:round(value), time:clock(times[index]), index};
      }
    }
    const notable = driest && driest.index !== start && driest.value < 30 && (now === null || driest.value < round(now));
    const forecast = notable ? `chega a ${driest.value}% às ${driest.time.slice(0, 2)}h` : "";
    const label = classification?.label || "Umidade indisponível";
    return {
      now: now === null ? null : round(now),
      level: classification?.level || null,
      label,
      driest,
      note: forecast ? `${label} · ${forecast}` : label
    };
  }

  // Média de 24h de PM2,5 contra a diretriz da OMS (2021: 15 µg/m³) e suas metas intermediárias.
  // Descreve a concentração; não identifica a origem das partículas.
  const PM25_LEVELS = [
    [15, "guideline", "Dentro da diretriz diária da OMS"],
    [25, "above-guideline", "Acima da diretriz diária da OMS"],
    [50, "elevated", "Partículas finas elevadas"],
    [75, "high", "Partículas finas muito elevadas"],
    [Infinity, "very-high", "Partículas finas em nível crítico"]
  ];
  function particles(mean) {
    const value = number(mean?.value);
    if (value === null || value < 0) return null;
    const [, level, label] = PM25_LEVELS.find(([limit]) => value <= limit);
    return {value: round(value, 1), samples: mean.samples, level, label, notable: value > 25};
  }

  function rain(hourly, start) {
    const times = hourly?.time || [];
    if (start < 0 || !times[start]) return null;
    // A 12-hour aggregate requires every sample; missing is not dry weather.
    const end = start + 13;
    if (end > times.length) return null;
    let chance = 0;
    let volume = 0;
    let peak = 0;
    let first = -1;
    let last = -1;
    for (let index = start + 1; index < end; index += 1) {
      if (Date.parse(times[index-1]?.slice(0,16)+'Z')+3600000 !== Date.parse(times[index]?.slice(0,16)+'Z')) return null;
      const probability = number(hourly.precipitation_probability?.[index]);
      const amount = number(hourly.precipitation?.[index]);
      if (probability === null || probability < 0 || probability > 100 || amount === null || amount < 0) return null;
      chance = Math.max(chance, probability);
      volume += Math.max(0, amount);
      peak = Math.max(peak, amount);
      if (probability >= 35 || amount >= 0.1) {
        if (first < 0) first = index;
        last = index;
      }
    }
    const intensity = peak >= 7.5 ? "forte" : peak >= 2.5 ? "moderada" : peak > 0 ? "fraca" : "sem volume relevante";
    const window = first >= 0 ? `${clock(times[first-1])}–${clock(times[last])}` : null;
    const volumeRounded = round(volume, 1);
    const meta = [
      `${Math.round(chance)}% de chance`,
      volumeRounded > 0 ? `~${volumeRounded.toLocaleString("pt-BR")} mm nas próximas 12h` : "sem volume relevante nas próximas 12h",
      window ? `maior atenção entre ${window}` : null
    ].filter(Boolean).join(" · ");
    return {chance:Math.round(chance), volume:volumeRounded, peak:round(peak,1), intensity, window, meta};
  }

  // "Vai chover?": uma linha para as próximas horas. A hora que começa em times[i] usa o
  // intervalo que termina em i+1 (convenção Open-Meteo, também aplicada ao MET). Valor
  // ausente não é tempo seco: a resposta só cobre as horas com leitura.
  const STORM_CODES = new Set([95, 96, 99]);
  const hourLabel = value => { const hour = Number(String(value || "").slice(11, 13)); return Number.isFinite(hour) ? `${hour}h` : clock(value); };
  // "das 15h" / "da 1h" / "da meia-noite"; "às 15h" / "à 1h" / "à meia-noite".
  const hourPhrase = (value, preposition = "das") => {
    const hour = Number(String(value || "").slice(11, 13));
    const singular = preposition === "às" ? "à" : "da";
    if (hour === 0) return `${singular} meia-noite`;
    return hour === 1 ? `${singular} 1h` : `${preposition} ${hourLabel(value)}`;
  };
  const rainIntensity = mm => mm >= 7.5 ? "forte" : mm >= 2.5 ? "moderada" : "fraca";
  // Código atual de chuva/trovoada vale como "chovendo agora", mesmo se a série horária
  // discordar; a intensidade vem do próprio código (garoa/fraca, moderada, forte).
  const CURRENT_RAIN = {51:"fraca",53:"fraca",55:"fraca",56:"fraca",57:"fraca",61:"fraca",80:"fraca",66:"fraca",63:"moderada",81:"moderada",65:"forte",67:"forte",82:"forte"};
  function rainAnswer(hourly, start, {horizon = 12, current = null} = {}) {
    const times = hourly?.time || [];
    const unknown = {tone:"unknown", text:"Previsão de chuva indisponível.", hours:0};
    if (!(start >= 0) || !times[start]) return unknown;
    const hours = [];
    for (let index = start; index < Math.min(times.length - 1, start + horizon); index += 1) {
      if (Date.parse(times[index].slice(0,16)+"Z") + 3600000 !== Date.parse(times[index+1]?.slice(0,16)+"Z")) break;
      const mm = number(hourly.precipitation?.[index+1]);
      const chance = number(hourly.precipitation_probability?.[index+1]);
      if ((mm === null || mm < 0) && (chance === null || chance < 0 || chance > 100)) break;
      hours.push({time:times[index], mm:mm !== null && mm >= 0 ? mm : null, chance:chance !== null && chance >= 0 && chance <= 100 ? chance : null,
        storm:STORM_CODES.has(number(hourly.weather_code?.[index+1]))});
    }
    if (!hours.length) return unknown;
    const nowCode = number(current?.weather_code);
    if (nowCode !== null && (CURRENT_RAIN[nowCode] || STORM_CODES.has(nowCode))) Object.assign(hours[0],{now:true,storm:hours[0].storm || STORM_CODES.has(nowCode),nowIntensity:CURRENT_RAIN[nowCode] || null});
    const wet = hour => hour.now || (hour.mm !== null && hour.mm >= 0.5) || (hour.chance !== null && hour.chance >= 50 && (hour.mm === null || hour.mm >= 0.1));
    const first = hours.findIndex(wet);
    if (first >= 0) {
      let end = first;
      while (end + 1 < hours.length && wet(hours[end + 1])) end += 1;
      const span = hours.slice(first, end + 1);
      const storm = span.some(hour => hour.storm);
      const peak = Math.max(0, ...span.map(hour => hour.mm ?? 0));
      const order = ["fraca","moderada","forte"];
      const intensity = [rainIntensity(peak), ...span.map(hour => hour.nowIntensity).filter(Boolean)].reduce((a,b) => order.indexOf(b) > order.indexOf(a) ? b : a);
      const kind = storm ? "trovoada" : `chuva ${intensity}`;
      if (first === 0) {
        const tail = end + 1 < hours.length ? `deve parar por volta ${hourPhrase(hours[end + 1].time)}` : `sem pausa prevista nas próximas ${hours.length} horas`;
        return {tone:storm ? "storm" : "rain", text:`${kind[0].toUpperCase()}${kind.slice(1)} agora; ${tail}.`, hours:hours.length, start:hours[0].time};
      }
      return {tone:storm ? "storm" : "rain", text:`Leve guarda-chuva: ${kind} a partir ${hourPhrase(hours[first].time)}.`, hours:hours.length, start:hours[first].time};
    }
    const maybe = hours.find(hour => hour.chance !== null && hour.chance >= 30);
    if (maybe) return {tone:"maybe", text:`Pode chover a partir ${hourPhrase(maybe.time)} (${Math.round(maybe.chance)}% de chance).`, hours:hours.length, start:maybe.time};
    if (hours.length < 3) return unknown;
    return {tone:"dry", text:`Sem chuva prevista nas próximas ${hours.length} horas.`, hours:hours.length};
  }

  function build(input) {
    const forecast = input?.forecast || input || {};
    const hourly = forecast.hourly || {};
    const start = currentIndex(hourly, input?.start ?? forecast.current?.time);
    const comparison = yesterday(hourly, start);
    const thermal = feelsLike(forecast.current);
    const ultraviolet = uv(hourly, start);
    const precipitation = rain(hourly, start);
    const highlights = [];
    if (comparison?.text) highlights.push(comparison.text);
    if (precipitation?.chance >= 60) highlights.push(`Chuva: ${precipitation.chance}% · ${precipitation.intensity}`);
    else if (precipitation?.chance >= 35) highlights.push(`Possibilidade de chuva: ${precipitation.chance}%`);
    else if (precipitation) highlights.push("Baixa chance de chuva");
    if (ultraviolet?.peak >= 6 && !ultraviolet.past) highlights.push(`UV ${ultraviolet.level} por volta de ${ultraviolet.time}`);
    const reasons = [];
    if (thermal?.reason) reasons.push(thermal.reason);
    if (precipitation?.chance >= 35) reasons.push(`A previsão indica ${precipitation.chance}% de chance e cerca de ${precipitation.volume.toLocaleString("pt-BR")} mm nas próximas 12 horas.`);
    if (ultraviolet?.peak >= 3) reasons.push(ultraviolet.label);
    return {
      comparison:comparison?.text || "",
      feelsLike:thermal?.label || "",
      uv:ultraviolet,
      rain:precipitation,
      highlights,
      reasons
    };
  }

  return {currentIndex, yesterday, feelsLike, uv, pressure, rain, rainAnswer, humidity, humidityLevel, particles, build, uniqueHighlights};
});
