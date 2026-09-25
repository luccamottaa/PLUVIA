/* MET Norway fornece o que existe na sua série; Open-Meteo completa as lacunas. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.metMerge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date);
    const value = name => parts.find(part => part.type === name)?.value;
    return {day:`${value('year')}-${value('month')}-${value('day')}`,hour:Number(value('hour'))};
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
    const utcOffset = Number.isFinite(forecast.utc_offset_seconds) ? forecast.utc_offset_seconds : null;
    const localKey = point => {
      const parts = localParts(new Date(point.time),timezone);
      return `${parts.day}T${String(parts.hour).padStart(2,'0')}:00`;
    };
    const byHour = new Map(points.map(point => [localKey(point),point]));
    const currentMillis = utcOffset === null ? now : Date.parse(`${current.time}Z`) - utcOffset * 1000;
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
      const values = points.filter(point => localParts(new Date(point.time),timezone).day === day);
      const hours = new Set(values.map(point => localParts(new Date(point.time),timezone).hour));
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
  return {merge,weatherCode};
});
