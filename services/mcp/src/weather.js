const FORECAST_BASE = 'https://api.open-meteo.com/v1/forecast';
const AIR_BASE = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const TIMEOUT_MS = 8000;

function assertCoordinates(latitude, longitude) {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('Latitude inválida.');
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('Longitude inválida.');
}

async function getJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`Fonte respondeu HTTP ${response.status}.`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function baseMeta(data, source, type) {
  return {
    source,
    type,
    kind: 'estimate',
    timezone: data.timezone || null,
    checkedAt: new Date().toISOString()
  };
}

export async function getCurrentWeather({ latitude, longitude }) {
  assertCoordinates(latitude, longitude);
  const url = new URL(FORECAST_BASE);
  url.searchParams.set('latitude', latitude);
  url.searchParams.set('longitude', longitude);
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,wind_gusts_10m');
  const data = await getJson(url);
  return { ...baseMeta(data, 'Open-Meteo', 'Previsão meteorológica'), dataAt: data.current?.time || null, current: data.current || null, units: data.current_units || {} };
}

export async function getRainForecast({ latitude, longitude, hours = 12 }) {
  assertCoordinates(latitude, longitude);
  const safeHours = Math.min(Math.max(Math.trunc(hours), 1), 48);
  const url = new URL(FORECAST_BASE);
  url.searchParams.set('latitude', latitude);
  url.searchParams.set('longitude', longitude);
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_hours', safeHours);
  url.searchParams.set('hourly', 'precipitation_probability,precipitation,rain,showers,weather_code');
  const data = await getJson(url);
  const h = data.hourly || {};
  const timeline = (h.time || []).map((time, index) => ({
    time,
    probability: h.precipitation_probability?.[index] ?? null,
    precipitation: h.precipitation?.[index] ?? null,
    rain: h.rain?.[index] ?? null,
    showers: h.showers?.[index] ?? null,
    weatherCode: h.weather_code?.[index] ?? null
  }));
  return { ...baseMeta(data, 'Open-Meteo', 'Precipitação modelada'), dataAt: timeline[0]?.time || null, timeline, units: data.hourly_units || {} };
}

export async function getAirQuality({ latitude, longitude }) {
  assertCoordinates(latitude, longitude);
  const url = new URL(AIR_BASE);
  url.searchParams.set('latitude', latitude);
  url.searchParams.set('longitude', longitude);
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('current', 'us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone');
  const data = await getJson(url);
  return { ...baseMeta(data, 'Open-Meteo / CAMS', 'Qualidade do ar'), dataAt: data.current?.time || null, current: data.current || null, units: data.current_units || {} };
}
