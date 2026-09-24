(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.weatherData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const snapshots = new Map();
  const number = value => typeof value === "number" && Number.isFinite(value) ? value : null;
  const at = (list, index) => Array.isArray(list) ? list[index] : undefined;
  const freeze = value => Object.freeze(value);

  const CURRENT_REQUIRED_FIELDS = [
    "temperature_2m", "apparent_temperature", "relative_humidity_2m", "precipitation",
    "weather_code", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m"
  ];
  const CURRENT_OPTIONAL_FIELDS = ["rain", "showers", "cloud_cover"];
  const HOURLY_NUMERIC_FIELDS = [
    "temperature_2m", "apparent_temperature", "precipitation_probability", "precipitation",
    "rain", "weather_code", "cloud_cover", "visibility", "wind_speed_10m",
    "wind_gusts_10m", "relative_humidity_2m", "pressure_msl", "uv_index"
  ];
  const HOURLY_REQUIRED_FIELDS = new Set([
    "temperature_2m", "apparent_temperature", "precipitation_probability", "precipitation",
    "weather_code", "wind_gusts_10m", "relative_humidity_2m", "pressure_msl", "uv_index"
  ]);
  const DAILY_NUMERIC_FIELDS = [
    "weather_code", "temperature_2m_max", "temperature_2m_min", "apparent_temperature_max",
    "apparent_temperature_min", "precipitation_sum", "rain_sum",
    "precipitation_probability_max", "uv_index_max"
  ];
  const DAILY_REQUIRED_FIELDS = new Set([
    "weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_sum",
    "precipitation_probability_max", "uv_index_max"
  ]);

  function timestamp(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && Number.isFinite(Date.parse(value));
  }

  function date(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`));
  }

  const finiteOrNull = value => value === null || Number.isFinite(value);

  function closestHourIndex(times, currentTime) {
    const target = Date.parse(currentTime);
    if (!Number.isFinite(target) || !Array.isArray(times) || !times.length) return 0;
    return times.reduce((best, time, index) => {
      const distance = Math.abs(Date.parse(time) - target);
      const bestDistance = Math.abs(Date.parse(times[best]) - target);
      return distance < bestDistance ? index : best;
    }, 0);
  }

  function validateForecast(forecast) {
    const errors = [];
    const current = forecast?.current;
    const hourly = forecast?.hourly;
    const daily = forecast?.daily;

    if (!current || typeof current !== "object") errors.push("current ausente");
    if (!timestamp(current?.time)) errors.push("current.time inválido");
    for (const field of CURRENT_REQUIRED_FIELDS) {
      if (!Number.isFinite(current?.[field])) errors.push(`current.${field} inválido`);
    }
    for (const field of CURRENT_OPTIONAL_FIELDS) {
      if (current?.[field] != null && !Number.isFinite(current[field])) errors.push(`current.${field} inválido`);
    }
    if (![0, 1].includes(current?.is_day)) errors.push("current.is_day inválido");
    if (!Number.isFinite(current?.pressure_msl) && !Number.isFinite(current?.surface_pressure)) {
      errors.push("pressão atual ausente");
    }
    if (Number.isFinite(current?.relative_humidity_2m) && (current.relative_humidity_2m < 0 || current.relative_humidity_2m > 100)) errors.push("umidade atual fora da faixa");
    if (Number.isFinite(current?.wind_direction_10m) && (current.wind_direction_10m < 0 || current.wind_direction_10m > 360)) errors.push("direção do vento fora da faixa");

    const hourlyLength = Array.isArray(hourly?.time) ? hourly.time.length : 0;
    if (hourlyLength < 3 || !hourly.time.every(timestamp)) errors.push("hourly.time inválido");
    const hourlyStart = closestHourIndex(hourly?.time, current?.time);
    const hourlyEnd = Math.min(hourlyLength, hourlyStart + 36);
    for (const field of HOURLY_NUMERIC_FIELDS) {
      const values = hourly?.[field];
      const aligned = Array.isArray(values) && values.length === hourlyLength && values.every(finiteOrNull);
      const visible = aligned && (!HOURLY_REQUIRED_FIELDS.has(field) || values.slice(hourlyStart, hourlyEnd).every(Number.isFinite));
      if (!aligned || !visible) {
        errors.push(`hourly.${field} inválido ou desalinhado`);
      }
    }
    if (hourly?.wind_direction_10m !== undefined) {
      const values = hourly.wind_direction_10m;
      if (!Array.isArray(values) || values.length !== hourlyLength || values.some(value => value !== null && (!Number.isFinite(value) || value < 0 || value > 360))) {
        errors.push("hourly.wind_direction_10m inválido ou desalinhado");
      }
    }
    for (const field of ["relative_humidity_2m", "precipitation_probability", "cloud_cover"]) {
      if (Array.isArray(hourly?.[field]) && hourly[field].some(value => value < 0 || value > 100)) errors.push(`hourly.${field} fora da faixa`);
    }
    for (const field of ["precipitation", "rain", "visibility", "wind_speed_10m", "wind_gusts_10m", "uv_index"]) {
      if (Array.isArray(hourly?.[field]) && hourly[field].some(value => value < 0)) errors.push(`hourly.${field} fora da faixa`);
    }

    const dailyLength = Array.isArray(daily?.time) ? daily.time.length : 0;
    if (dailyLength < 1 || !daily.time.every(date)) errors.push("daily.time inválido");
    const visibleDays = Math.min(7, dailyLength);
    for (const field of DAILY_NUMERIC_FIELDS) {
      const values = daily?.[field];
      const aligned = Array.isArray(values) && values.length === dailyLength && values.every(finiteOrNull);
      const visible = aligned && (!DAILY_REQUIRED_FIELDS.has(field) || values.slice(0, visibleDays).every(Number.isFinite));
      if (!aligned || !visible) {
        errors.push(`daily.${field} inválido ou desalinhado`);
      }
    }
    for (const field of ["sunrise", "sunset"]) {
      const values = daily?.[field];
      const aligned = Array.isArray(values) && values.length === dailyLength && values.every(value => value === null || timestamp(value));
      const visible = aligned && values.slice(0, visibleDays).every(timestamp);
      if (!aligned || !visible) {
        errors.push(`daily.${field} inválido ou desalinhado`);
      }
    }
    if (Array.isArray(daily?.precipitation_probability_max) && daily.precipitation_probability_max.some(value => value < 0 || value > 100)) errors.push("probabilidade diária fora da faixa");
    for (const field of ["precipitation_sum", "rain_sum", "uv_index_max"]) {
      if (Array.isArray(daily?.[field]) && daily[field].some(value => value < 0)) errors.push(`daily.${field} fora da faixa`);
    }

    return freeze({valid: errors.length === 0, errors: freeze(errors)});
  }

  function validateAirQuality(air) {
    const errors = [];
    const current = air?.current;
    if (!current || typeof current !== "object") errors.push("current ausente");
    if (!timestamp(current?.time)) errors.push("current.time inválido");
    if (!Number.isFinite(current?.us_aqi) || current.us_aqi < 0 || current.us_aqi > 500) errors.push("current.us_aqi inválido");
    for (const field of ["pm2_5", "pm10", "ozone", "nitrogen_dioxide", "sulphur_dioxide", "carbon_monoxide"]) {
      if (current?.[field] != null && (!Number.isFinite(current[field]) || current[field] < 0)) errors.push(`current.${field} inválido`);
    }
    return freeze({valid: errors.length === 0, errors: freeze(errors)});
  }

  function normalizeLocation(city = {}) {
    return freeze({
      id: String(city.id || ""),
      name: String(city.name || ""),
      region: String(city.uf || city.region || ""),
      timezone: String(city.timezone || "UTC"),
      latitude: number(city.lat ?? city.latitude),
      longitude: number(city.lon ?? city.longitude),
      precision: city.precision === "gps" ? "gps" : "municipality"
    });
  }

  function normalizeCurrent(current = {}) {
    return freeze({
      time: current.time || null,
      temperature: number(current.temperature_2m),
      apparentTemperature: number(current.apparent_temperature),
      relativeHumidity: number(current.relative_humidity_2m),
      precipitation: number(current.precipitation),
      rain: number(current.rain),
      showers: number(current.showers),
      weatherCode: number(current.weather_code),
      cloudCover: number(current.cloud_cover),
      pressureMsl: number(current.pressure_msl),
      surfacePressure: number(current.surface_pressure),
      windSpeed: number(current.wind_speed_10m),
      windDirection: number(current.wind_direction_10m),
      windGust: number(current.wind_gusts_10m),
      isDay: current.is_day === 1 ? true : current.is_day === 0 ? false : null
    });
  }

  function normalizeHourly(hourly = {}) {
    return freeze((hourly.time || []).map((time, index) => freeze({
      time,
      temperature: number(at(hourly.temperature_2m, index)),
      apparentTemperature: number(at(hourly.apparent_temperature, index)),
      relativeHumidity: number(at(hourly.relative_humidity_2m, index)),
      precipitationProbability: number(at(hourly.precipitation_probability, index)),
      precipitation: number(at(hourly.precipitation, index)),
      rain: number(at(hourly.rain, index)),
      weatherCode: number(at(hourly.weather_code, index)),
      cloudCover: number(at(hourly.cloud_cover, index)),
      visibility: number(at(hourly.visibility, index)),
      pressureMsl: number(at(hourly.pressure_msl, index)),
      windSpeed: number(at(hourly.wind_speed_10m, index)),
      windGust: number(at(hourly.wind_gusts_10m, index)),
      uvIndex: number(at(hourly.uv_index, index))
    })));
  }

  function normalizeDaily(daily = {}) {
    return freeze((daily.time || []).map((time, index) => freeze({
      time,
      weatherCode: number(at(daily.weather_code, index)),
      temperatureMax: number(at(daily.temperature_2m_max, index)),
      temperatureMin: number(at(daily.temperature_2m_min, index)),
      apparentTemperatureMax: number(at(daily.apparent_temperature_max, index)),
      apparentTemperatureMin: number(at(daily.apparent_temperature_min, index)),
      precipitationSum: number(at(daily.precipitation_sum, index)),
      rainSum: number(at(daily.rain_sum, index)),
      precipitationProbabilityMax: number(at(daily.precipitation_probability_max, index)),
      uvIndexMax: number(at(daily.uv_index_max, index)),
      sunrise: at(daily.sunrise, index) || null,
      sunset: at(daily.sunset, index) || null
    })));
  }

  function normalizeAir(current = {}) {
    return freeze({
      time: current.time || null,
      aqiUs: number(current.us_aqi),
      pm25: number(current.pm2_5),
      pm10: number(current.pm10),
      ozone: number(current.ozone),
      nitrogenDioxide: number(current.nitrogen_dioxide),
      sulphurDioxide: number(current.sulphur_dioxide),
      carbonMonoxide: number(current.carbon_monoxide)
    });
  }

  function normalizeOpenMeteo(forecast, air, city, metadata = {}) {
    const validation = validateForecast(forecast);
    if (!validation.valid) throw new TypeError(`Resposta meteorológica incompleta para normalização: ${validation.errors[0]}.`);
    if (air && !validateAirQuality(air).valid) air = null;
    const checkedAt = number(metadata.checkedAt) || Date.now();
    const location = normalizeLocation(city);
    return freeze({
      schemaVersion: 1,
      location,
      source: freeze({
        weather: "open-meteo",
        airQuality: air ? "open-meteo-cams" : null,
        kind: "model",
        checkedAt,
        dataTime: forecast.current.time || null,
        freshness: metadata.freshness === "stale" ? "stale" : "current"
      }),
      units: freeze({
        temperature: "celsius",
        precipitation: "millimeter",
        windSpeed: "kilometer-per-hour",
        pressure: "hectopascal",
        visibility: "meter",
        particles: "microgram-per-cubic-meter"
      }),
      current: normalizeCurrent(forecast.current),
      hourly: normalizeHourly(forecast.hourly),
      daily: normalizeDaily(forecast.daily),
      airQuality: air?.current ? normalizeAir(air.current) : null,
      raw: freeze({ forecast, air: air || null })
    });
  }

  function ingestOpenMeteo(forecast, air, city, metadata) {
    const snapshot = normalizeOpenMeteo(forecast, air, city, metadata);
    if (snapshot.location.id) snapshots.set(snapshot.location.id, snapshot);
    return snapshot;
  }

  function get(cityId) { return snapshots.get(String(cityId || "")) || null; }
  function clear(cityId) { cityId == null ? snapshots.clear() : snapshots.delete(String(cityId)); }

  return { validateForecast, validateAirQuality, normalizeOpenMeteo, ingestOpenMeteo, get, clear };
});
