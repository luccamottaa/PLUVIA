(function (root, factory) {
  const api = factory();
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.weatherInsights = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const finite = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  const number = value => finite(value) ? Number(value) : null;
  const round = (value, digits = 0) => {
    const factor = 10 ** digits;
    return Math.round(Number(value) * factor) / factor;
  };
  const clock = value => String(value || "").slice(11, 16);
  const day = value => String(value || "").slice(0, 10);

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
    if (gap >= 3 && humidity !== null && humidity >= 65) {
      return {label:"Elevada pelo calor e pela umidade.", reason:"A umidade reduz a eficiência do suor e eleva a sensação térmica."};
    }
    if (gap >= 2) return {label:"Acima da temperatura medida.", reason:"A combinação de calor, umidade e pouco vento aumenta a sensação."};
    if (gap <= -2 && wind !== null && wind >= 15) {
      return {label:"Mais baixa por causa do vento.", reason:"O vento favorece a perda de calor e reduz a sensação térmica."};
    }
    return {label:"Próxima da temperatura medida.", reason:"Temperatura e sensação térmica estão próximas neste momento."};
  }

  function uv(hourly, start) {
    const times = hourly?.time || [];
    if (start < 0 || !times[start]) return null;
    const localDay = day(times[start]);
    let peak = -1;
    let peakIndex = -1;
    for (let index = start; index < times.length && day(times[index]) === localDay; index += 1) {
      const value = number(hourly.uv_index?.[index]);
      if (value !== null && value > peak) {
        peak = value;
        peakIndex = index;
      }
    }
    if (peakIndex < 0) return null;
    const level = peak >= 11 ? "extremo" : peak >= 8 ? "muito alto" : peak >= 6 ? "alto" : peak >= 3 ? "moderado" : "baixo";
    return {
      peak:round(peak, 1),
      time:clock(times[peakIndex]),
      level,
      label: peak >= 3 ? `Pico ${level} previsto às ${clock(times[peakIndex])}.` : "UV baixo no restante do dia."
    };
  }

  function rain(hourly, start) {
    const times = hourly?.time || [];
    if (start < 0 || !times[start]) return null;
    const end = Math.min(times.length, start + 12);
    let chance = 0;
    let volume = 0;
    let peak = 0;
    let first = -1;
    let last = -1;
    for (let index = start; index < end; index += 1) {
      const probability = number(hourly.precipitation_probability?.[index]) || 0;
      const amount = number(hourly.precipitation?.[index]) || 0;
      chance = Math.max(chance, probability);
      volume += Math.max(0, amount);
      peak = Math.max(peak, amount);
      if (probability >= 35 || amount >= 0.1) {
        if (first < 0) first = index;
        last = index;
      }
    }
    const intensity = peak >= 7.5 ? "forte" : peak >= 2.5 ? "moderada" : peak > 0 ? "fraca" : "sem volume relevante";
    const window = first >= 0 ? (first === last ? clock(times[first]) : `${clock(times[first])}–${clock(times[last])}`) : null;
    const volumeRounded = round(volume, 1);
    const meta = [
      `${Math.round(chance)}% de chance`,
      volumeRounded > 0 ? `~${volumeRounded.toLocaleString("pt-BR")} mm nas próximas 12h` : "sem volume relevante nas próximas 12h",
      window ? `maior atenção entre ${window}` : null
    ].filter(Boolean).join(" · ");
    return {chance:Math.round(chance), volume:volumeRounded, peak:round(peak,1), intensity, window, meta};
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
    else if (precipitation) highlights.push("Baixa chance de chuva");
    if (ultraviolet?.peak >= 6) highlights.push(`UV ${ultraviolet.level} às ${ultraviolet.time}`);
    const reasons = [];
    if (thermal?.reason) reasons.push(thermal.reason);
    if (precipitation?.chance >= 35) reasons.push(`A previsão indica ${precipitation.chance}% de chance e cerca de ${precipitation.volume.toLocaleString("pt-BR")} mm nas próximas 12 horas.`);
    if (ultraviolet?.peak >= 3) reasons.push(`O índice UV deve atingir nível ${ultraviolet.level} por volta de ${ultraviolet.time}.`);
    return {
      comparison:comparison?.text || "",
      feelsLike:thermal?.label || "",
      uv:ultraviolet,
      rain:precipitation,
      highlights,
      reasons
    };
  }

  return {currentIndex, yesterday, feelsLike, uv, rain, build};
});
