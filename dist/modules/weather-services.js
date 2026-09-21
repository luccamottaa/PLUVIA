(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PLUVIA = root.PLUVIA || {};
  root.PLUVIA.services = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (runtime) {
  "use strict";

  const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
  const AIR_QUALITY_ENDPOINT = "https://air-quality-api.open-meteo.com/v1/air-quality";
  const INMET_ACTIVE_ENDPOINT = "https://apiprevmet3.inmet.gov.br/avisos/ativos";
  const MANAUS_DEFENSE_ENDPOINT = "https://www.manaus.am.gov.br/wp-json/wp/v2/posts?search=Defesa%20Civil%20alerta&per_page=8&_fields=date,link,title,excerpt";

  const FORECAST_PARAMS = {
    current:"temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
    hourly:"temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,weather_code,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,pressure_msl,uv_index",
    daily:"weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum,rain_sum,precipitation_probability_max,uv_index_max,sunrise,sunset",
    temperature_unit:"celsius", wind_speed_unit:"kmh", precipitation_unit:"mm", past_hours:"24", forecast_days:"8"
  };
  const AIR_PARAMS = {
    current:"pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,us_aqi", forecast_days:"3"
  };

  function location(city) {
    const latitude = Number(city?.lat ?? city?.latitude);
    const longitude = Number(city?.lon ?? city?.longitude);
    const timezone = String(city?.timezone || "");
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !timezone) {
      throw new TypeError("Localização meteorológica inválida.");
    }
    return {latitude, longitude, timezone};
  }

  function buildUrl(endpoint, city, params = {}) {
    const place = location(city);
    const url = new URL(endpoint);
    url.searchParams.set("latitude", String(place.latitude));
    url.searchParams.set("longitude", String(place.longitude));
    url.searchParams.set("timezone", place.timezone);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.href;
  }

  function precipitationGridUrl(city) {
    const place = location(city);
    const latStep = .12;
    const lonStep = .12 / Math.max(.4, Math.cos(place.latitude * Math.PI / 180));
    const points = [];
    for (const y of [1,0,-1]) for (const x of [-1,0,1]) points.push([place.latitude + y * latStep, place.longitude + x * lonStep]);
    const url = new URL(FORECAST_ENDPOINT);
    url.searchParams.set("latitude", points.map(point => point[0].toFixed(4)).join(","));
    url.searchParams.set("longitude", points.map(point => point[1].toFixed(4)).join(","));
    url.searchParams.set("hourly", "precipitation,precipitation_probability");
    url.searchParams.set("forecast_hours", "8");
    url.searchParams.set("precipitation_unit", "mm");
    url.searchParams.set("timezone", place.timezone);
    return url.href;
  }

  function createServices({client = runtime.PLUVIA?.http?.client} = {}) {
    const getJson = (url, options = {}) => {
      if (!client?.getJson) throw new Error("Cliente HTTP dos serviços meteorológicos não carregado.");
      return client.getJson(url, {timeoutMs:options.timeoutMs ?? 12000, cache:options.cache || "default", signal:options.signal});
    };
    return {
      abortAll: () => client?.abortAll?.(),
      weather: {
        source:"open-meteo",
        forecastUrl: city => buildUrl(FORECAST_ENDPOINT, city, FORECAST_PARAMS),
        precipitationGridUrl,
        getForecast: (city, options) => getJson(buildUrl(FORECAST_ENDPOINT, city, FORECAST_PARAMS), options),
        getPrecipitationGrid: (city, options = {}) => getJson(precipitationGridUrl(city), {...options, timeoutMs:options.timeoutMs ?? 10000})
      },
      airQuality: {
        source:"open-meteo-cams",
        currentUrl: city => buildUrl(AIR_QUALITY_ENDPOINT, city, AIR_PARAMS),
        getCurrent: (city, options) => getJson(buildUrl(AIR_QUALITY_ENDPOINT, city, AIR_PARAMS), options)
      },
      alerts: {
        source:"inmet",
        activeUrl:INMET_ACTIVE_ENDPOINT,
        getActive: options => getJson(INMET_ACTIVE_ENDPOINT, options)
      },
      civilDefense: {
        source:"defesa-civil-manaus",
        recentUrl:MANAUS_DEFENSE_ENDPOINT,
        getManausRecent: options => getJson(MANAUS_DEFENSE_ENDPOINT, options)
      }
    };
  }

  const services = createServices();
  services.createServices = createServices;
  return services;
});
