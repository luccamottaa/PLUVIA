/* MET Norway fornece o que existe na sua série; Open-Meteo completa as lacunas. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./city-time.js') : root.PLUVIA?.time);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.metMerge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (time) {
  'use strict';
  const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const symbols = {
    clearsky:0, fair:1, partlycloudy:2, cloudy:3, fog:45,
    lightrain:61, rain:63, heavyrain:65, lightrainshowers:80, rainshowers:81, heavyrainshowers:82,
    lightsleet:66, sleet:67, heavysleet:67, lightsleetshowers:85, sleetshowers:85, heavysleetshowers:86,
    lightsnow:71, snow:73, heavysnow:75, lightsnowshowers:85, snowshowers:85, heavysnowshowers:86,
    lightdrizzle:51, drizzle:53, heavydrizzle:55,
    rainandthunder:95, heavyrainandthunder:95, rainshowersandthunder:95,
    lightrainandthunder:95, lightrainshowersandthunder:95,
    snowandthunder:95, sleetandthunder:95
  };
  const weatherCode = symbol => symbols[typeof symbol === 'string' ? symbol.replace(/_(day|night|polartwilight)$/, '') : ''];
  function localParts(date, timezone) {
    return time.localParts(date.getTime(),timezone);
  }
  function merge(forecast, met, timezone, now = Date.now()) {
    if (!forecast?.current || !forecast?.hourly || !forecast?.daily || met?.source !== 'MET Norway' || !Array.isArray(met.hourly) || !met.hourly.length) {
      return {forecast,used:false};
    }
    const points = met.hourly.filter(point => Number.isFinite(Date.parse(point?.time)) && Date.parse(point.time) >= now - 90 * 60_000 && Date.parse(point.time) <= now + 8 * 86400_000);
    if (!points.length) return {forecast,used:false};
    const current = {...forecast.current};
    const hourly = {...forecast.hourly};
    const daily = {...forecast.daily};
    const touched = new Set();
    function write(target, key, value, min, max) {
      if (finite(value,min,max)) { target[key] = value; touched.add(key); }
    }
    const partsByPoint = new Map(points.map(point => [point,localParts(new Date(point.time),timezone)]));
    const localKey = point => {
      const parts = partsByPoint.get(point);
      return `${parts.day}T${String(parts.hour).padStart(2,'0')}:00`;
    };
    const byHour = new Map(points.map(point => [localKey(point),point]));
    const currentMillis = time.parse(current.time,timezone);
    const currentPoint = points.reduce((best,point) => Math.abs(Date.parse(point.time) - currentMillis) < Math.abs(Date.parse(best.time) - currentMillis) ? point : best,points[0]);
    const currentDistance = Date.parse(currentPoint.time) - now;
    // Não mostrar um valor futuro distante como se fosse a condição atual.
    if (currentDistance >= -75 * 60_000 && currentDistance <= 40 * 60_000 &&
        localKey(currentPoint) === current.time.slice(0,13) + ':00' &&
        Math.abs(Date.parse(currentPoint.time) - currentMillis) <= 60 * 60_000) {
      write(current,'temperature_2m',currentPoint.temperatureC,-90,70);
      write(current,'relative_humidity_2m',currentPoint.humidity,0,100);
      write(current,'pressure_msl',currentPoint.pressureHpa,850,1100);
      write(current,'cloud_cover',currentPoint.cloudCover,0,100);
      write(current,'wind_speed_10m',currentPoint.windKmh,0,432);
      write(current,'wind_gusts_10m',currentPoint.gustKmh,0,432);
      write(current,'wind_direction_10m',currentPoint.windDirection,0,360);
      const code = weatherCode(currentPoint.symbol);
      if (Number.isFinite(code)) {current.weather_code = code; touched.add('weather_code');}
    }
    const updates = {
      temperatureC:['temperature_2m',-90,70], humidity:['relative_humidity_2m',0,100],
      pressureHpa:['pressure_msl',850,1100], cloudCover:['cloud_cover',0,100],
      windKmh:['wind_speed_10m',0,432],gustKmh:['wind_gusts_10m',0,432],windDirection:['wind_direction_10m',0,360]
    };
    (hourly.time || []).forEach((time,index) => {
      const point = byHour.get(time.slice(0,13) + ':00');
      if (!point) return;
      for (const [field,[key,min,max]] of Object.entries(updates)) {
        if (!Array.isArray(hourly[key]) || !finite(point[field],min,max)) continue;
        if (hourly[key] === forecast.hourly[key]) hourly[key] = [...hourly[key]];
        hourly[key][index] = point[field]; touched.add(`hourly.${key}`);
      }
      const code = weatherCode(point.symbol);
      if (Number.isFinite(code) && Array.isArray(hourly.weather_code)) {
        if (hourly.weather_code === forecast.hourly.weather_code) hourly.weather_code = [...hourly.weather_code];
        hourly.weather_code[index] = code; touched.add('hourly.weather_code');
      }
      // O acumulado next_1_hours começa neste instante, termina na hora seguinte.
      if (index + 1 < hourly.time.length && Array.isArray(hourly.precipitation) &&
          finite(point.precipitationNextHourMm,0,1000) && byHour.has(hourly.time[index + 1].slice(0,13) + ':00')) {
        if (hourly.precipitation === forecast.hourly.precipitation) hourly.precipitation = [...hourly.precipitation];
        hourly.precipitation[index + 1] = point.precipitationNextHourMm; touched.add('hourly.precipitation');
      }
    });
    (daily.time || []).forEach((day,index) => {
      const values = points.filter(point => partsByPoint.get(point).day === day);
      const hours = new Set(values.map(point => partsByPoint.get(point).hour));
      if (hours.size < 22 || !hours.has(0) || !hours.has(23)) return;
      const temps = values.map(point => point.temperatureC);
      if (temps.every(value => finite(value,-90,70))) {
        for (const [key,value] of [['temperature_2m_max',Math.max(...temps)],['temperature_2m_min',Math.min(...temps)]]) {
          if (!Array.isArray(daily[key])) continue;
          if (daily[key] === forecast.daily[key]) daily[key] = [...daily[key]];
          daily[key][index] = value; touched.add(`daily.${key}`);
        }
      }
      const codes = values.map(point => weatherCode(point.symbol));
      if (codes.every(Number.isFinite) && Array.isArray(daily.weather_code)) {
        const severity = code => code >= 95 ? 6 : code >= 80 ? 5 : code >= 51 && code <= 77 ? 4 : code >= 45 ? 3 : code >= 3 ? 2 : code >= 1 ? 1 : 0;
        if (daily.weather_code === forecast.daily.weather_code) daily.weather_code = [...daily.weather_code];
        daily.weather_code[index] = codes.reduce((worst,code) => severity(code) > severity(worst) ? code : worst,codes[0]);
        touched.add('daily.weather_code');
      }
    });
    return {forecast:{...forecast,current,hourly,daily,pluviaSources:{metNorway:[...touched]}},used:touched.size > 0,fields:[...touched],time:currentPoint.time};
  }
  const pad = value => String(value).padStart(2,'0');
  function localIso(at, timezone) {
    const parts = localParts(new Date(at),timezone);
    return `${parts.day}T${pad(parts.hour)}:${pad(parts.minute)}`;
  }
  /* Previsão reduzida só com o MET Norway, para quando o Open-Meteo falhar.
     Mesmo formato do Open-Meteo, mas o que o MET não entrega (sensação, chance de
     chuva, UV, visibilidade) fica null: ausência nunca vira zero nem estimativa.
     Usa só a parte horária contínua da série; dias sem 22 horas cobertas ficam sem
     máxima/mínima. Nascer/pôr vêm do cálculo astronômico (SunCalc), não do provedor. */
  function toForecast(met, city, {sun = null, now = Date.now()} = {}) {
    const timezone = city?.timezone;
    if (met?.source !== 'MET Norway' || !Array.isArray(met.hourly) || !timezone) return null;
    const sorted = met.hourly.filter(point => Number.isFinite(Date.parse(point?.time)) && Date.parse(point.time) % 3600000 === 0)
      .sort((a,b) => Date.parse(a.time) - Date.parse(b.time));
    const points = [];
    for (const point of sorted) {
      const at = Date.parse(point.time);
      if (at < now - 90 * 60_000) continue;
      if (points.length && at - Date.parse(points[points.length - 1].time) !== 3600000) break;
      points.push(point);
    }
    if (points.length < 3) return null;
    const value = (point,key,min,max) => finite(point[key],min,max) ? point[key] : null;
    const times = points.map(point => localIso(Date.parse(point.time),timezone));
    const series = (key,min,max) => points.map(point => value(point,key,min,max));
    const hourly = {
      time:times,
      temperature_2m:series('temperatureC',-90,70),
      apparent_temperature:times.map(() => null),
      precipitation_probability:times.map(() => null),
      // next_1_hours começa no ponto: o acumulado pertence ao intervalo que termina na hora seguinte.
      precipitation:points.map((point,i) => i === 0 ? null : value(points[i-1],'precipitationNextHourMm',0,1000)),
      rain:times.map(() => null),
      weather_code:points.map(point => { const code = weatherCode(point.symbol); return Number.isFinite(code) ? code : null; }),
      cloud_cover:series('cloudCover',0,100),
      visibility:times.map(() => null),
      wind_speed_10m:series('windKmh',0,432),
      wind_gusts_10m:series('gustKmh',0,432),
      wind_direction_10m:series('windDirection',0,360),
      relative_humidity_2m:series('humidity',0,100),
      pressure_msl:series('pressureHpa',850,1100),
      uv_index:times.map(() => null)
    };
    const solar = day => {
      try {
        const result = sun?.getTimes?.(new Date(time.parse(`${day}T12:00:00`,timezone)),city.lat,city.lon) || {};
        const rise = result.sunrise?.getTime?.(), set = result.sunset?.getTime?.();
        return Number.isFinite(rise) && Number.isFinite(set) && set > rise ? {rise,set} : null;
      } catch { return null; }
    };
    const nearest = points.reduce((best,point) => Math.abs(Date.parse(point.time) - now) < Math.abs(Date.parse(best.time) - now) ? point : best,points[0]);
    if (Math.abs(Date.parse(nearest.time) - now) > 75 * 60_000) return null;
    const index = points.indexOf(nearest);
    const today = localParts(new Date(now),timezone).day;
    const todaySolar = solar(today);
    const current = {
      time:times[index],
      temperature_2m:hourly.temperature_2m[index],
      apparent_temperature:null,
      relative_humidity_2m:hourly.relative_humidity_2m[index],
      precipitation:null,
      rain:null,
      weather_code:hourly.weather_code[index],
      cloud_cover:hourly.cloud_cover[index],
      pressure_msl:hourly.pressure_msl[index],
      wind_speed_10m:hourly.wind_speed_10m[index],
      wind_direction_10m:hourly.wind_direction_10m[index],
      wind_gusts_10m:hourly.wind_gusts_10m[index],
      is_day:todaySolar ? Number(now >= todaySolar.rise && now < todaySolar.set) : null
    };
    const days = [today, ...new Set(times.map(value => value.slice(0,10)).filter(day => day > today))];
    const daily = {time:[],weather_code:[],temperature_2m_max:[],temperature_2m_min:[],apparent_temperature_max:[],apparent_temperature_min:[],
      precipitation_sum:[],rain_sum:[],precipitation_probability_max:[],uv_index_max:[],sunrise:[],sunset:[]};
    for (const day of days) {
      const hours = times.map((value,i) => value.slice(0,10) === day ? i : -1).filter(i => i >= 0);
      const complete = new Set(hours.map(i => times[i].slice(11,13))).size >= 22;
      if (day !== today && !complete) continue;
      const temps = hours.map(i => hourly.temperature_2m[i]);
      const codes = hours.map(i => hourly.weather_code[i]);
      const rain = hours.map(i => hourly.precipitation[i]);
      const severity = code => code >= 95 ? 6 : code >= 80 ? 5 : code >= 51 && code <= 77 ? 4 : code >= 45 ? 3 : code >= 3 ? 2 : code >= 1 ? 1 : 0;
      const sunTimes = solar(day);
      daily.time.push(day);
      daily.temperature_2m_max.push(complete && temps.every(Number.isFinite) ? Math.max(...temps) : null);
      daily.temperature_2m_min.push(complete && temps.every(Number.isFinite) ? Math.min(...temps) : null);
      daily.weather_code.push(codes.some(Number.isFinite) ? codes.filter(Number.isFinite).reduce((worst,code) => severity(code) > severity(worst) ? code : worst) : null);
      daily.precipitation_sum.push(complete && rain.every(Number.isFinite) ? Math.round(rain.reduce((a,b) => a + b,0) * 10) / 10 : null);
      for (const key of ['apparent_temperature_max','apparent_temperature_min','rain_sum','precipitation_probability_max','uv_index_max']) daily[key].push(null);
      daily.sunrise.push(sunTimes ? localIso(sunTimes.rise,timezone) : null);
      daily.sunset.push(sunTimes ? localIso(sunTimes.set,timezone) : null);
    }
    return {timezone,current,hourly,daily,pluviaReduced:{source:'MET Norway',missing:['apparent_temperature','precipitation_probability','uv_index','visibility']},
      pluviaSources:{metNorway:['reduced']}};
  }
  return {merge,weatherCode,toForecast};
});
