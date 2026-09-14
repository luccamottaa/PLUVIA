(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.weatherData = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const snapshots = new Map();
  const number = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const at = (list, index) => Array.isArray(list) ? list[index] : undefined;
  const freeze = value => Object.freeze(value);

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
      isDay: current.is_day == null ? null : Number(current.is_day) !== 0
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
    if (!forecast?.current || !Array.isArray(forecast?.hourly?.time) || !Array.isArray(forecast?.daily?.time)) {
      throw new TypeError("Resposta meteorológica incompleta para normalização.");
    }
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

  return { normalizeOpenMeteo, ingestOpenMeteo, get, clear };
});
