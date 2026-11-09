import type { City, CurrentReading, DayReading, Forecast, HourReading } from '../types';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const TIMEOUT_MS = 12_000;

const CURRENT = 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,uv_index,weather_code,is_day';
const HOURLY = 'temperature_2m,weather_code,is_day,precipitation,precipitation_probability,relative_humidity_2m,uv_index,wind_speed_10m';
const DAILY = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum';

export class WeatherError extends Error {
  constructor(readonly code: 'cancelled' | 'timeout' | 'network' | 'invalid_response' | 'provider_unavailable', message: string) {
    super(message);
  }
}

/** Número finito ou null. Nunca transforma ausência em zero. */
export function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** "2026-11-09T14:00" + offset da cidade → instante real. Não depende do fuso do aparelho. */
export function parseLocal(value: string, offsetSeconds: number): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0'] = m;
  return new Date(Date.UTC(+y!, +mo! - 1, +d!, +h, +mi) - offsetSeconds * 1000);
}

/** Data de calendário ("2026-11-09") ancorada em UTC: formatar sempre com timeZone:'UTC'. */
export function parseCalendar(value: string): Date | null {
  return parseLocal(value, 0);
}

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new WeatherError('timeout', 'A fonte demorou demais.')), TIMEOUT_MS);
  const onAbort = () => controller.abort(new WeatherError('cancelled', 'Consulta cancelada.'));
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 429 || response.status >= 500) throw new WeatherError('provider_unavailable', 'A fonte está fora do ar.');
    if (!response.ok) throw new WeatherError('invalid_response', `Resposta ${response.status}.`);
    try {
      return await response.json();
    } catch {
      throw new WeatherError('invalid_response', 'Resposta inválida da fonte.');
    }
  } catch (error) {
    if (error instanceof WeatherError) throw error;
    const reason = controller.signal.reason;
    if (reason instanceof WeatherError) throw reason;
    throw new WeatherError('network', 'Sem conexão com a fonte.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

type Raw = Record<string, unknown>;
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Converte a resposta do Open-Meteo no contrato do app.
 * Precipitação e chance horárias do Open-Meteo valem para o intervalo que TERMINA no horário;
 * para a hora que começa em i, lemos i+1.
 */
export function toForecast(json: unknown, city: City, now = new Date()): Forecast {
  const raw = (json ?? {}) as Raw;
  const offset = num(raw.utc_offset_seconds);
  const current = raw.current as Raw | undefined;
  const hourly = raw.hourly as Raw | undefined;
  const daily = raw.daily as Raw | undefined;
  if (offset === null || !current || !hourly || !daily) throw new WeatherError('invalid_response', 'Previsão incompleta.');

  const currentAt = typeof current.time === 'string' ? parseLocal(current.time, offset) : null;
  if (!currentAt) throw new WeatherError('invalid_response', 'Leitura atual sem horário.');

  const reading: CurrentReading = {
    at: currentAt,
    temperature: num(current.temperature_2m),
    apparent: num(current.apparent_temperature),
    humidity: num(current.relative_humidity_2m),
    windSpeed: num(current.wind_speed_10m),
    windGusts: num(current.wind_gusts_10m),
    windDirection: num(current.wind_direction_10m),
    uvIndex: num(current.uv_index),
    code: num(current.weather_code),
    isDay: current.is_day === 1,
  };

  const times = arr(hourly.time);
  const temps = arr(hourly.temperature_2m);
  const codes = arr(hourly.weather_code);
  const days = arr(hourly.is_day);
  const rain = arr(hourly.precipitation);
  const chance = arr(hourly.precipitation_probability);
  const humidity = arr(hourly.relative_humidity_2m);
  const uv = arr(hourly.uv_index);
  const wind = arr(hourly.wind_speed_10m);
  const hours: HourReading[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const at = typeof times[i] === 'string' ? parseLocal(times[i] as string, offset) : null;
    if (!at || at.getTime() + 3_600_000 <= now.getTime()) continue; // horas já encerradas
    hours.push({
      at,
      temperature: num(temps[i]),
      code: num(codes[i]),
      isDay: days[i] === 1,
      rainMm: num(rain[i + 1]),
      rainChance: num(chance[i + 1]),
      humidity: num(humidity[i]),
      uvIndex: num(uv[i]),
      windSpeed: num(wind[i]),
    });
    if (hours.length === 24) break;
  }

  const dates = arr(daily.time);
  const out: DayReading[] = [];
  for (let i = 0; i < dates.length; i += 1) {
    const date = typeof dates[i] === 'string' ? parseCalendar(dates[i] as string) : null;
    if (!date) continue;
    out.push({
      date,
      code: num(arr(daily.weather_code)[i]),
      max: num(arr(daily.temperature_2m_max)[i]),
      min: num(arr(daily.temperature_2m_min)[i]),
      rainChance: num(arr(daily.precipitation_probability_max)[i]),
      rainMm: num(arr(daily.precipitation_sum)[i]),
    });
  }

  const timezone = typeof raw.timezone === 'string' ? raw.timezone : city.timezone;
  return { city: { ...city, timezone }, fetchedAt: now, current: reading, hours, days: out };
}

export async function fetchForecast(city: City, signal?: AbortSignal): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: city.latitude.toFixed(4),
    longitude: city.longitude.toFixed(4),
    timezone: city.timezone || 'auto',
    current: CURRENT,
    hourly: HOURLY,
    daily: DAILY,
    past_hours: '1',
    forecast_hours: '26',
    forecast_days: '7',
  });
  return toForecast(await getJson(`${FORECAST_URL}?${params}`, signal), city);
}

const UF: Record<string, string> = {
  Acre: 'AC', Alagoas: 'AL', Amapá: 'AP', Amazonas: 'AM', Bahia: 'BA', Ceará: 'CE', 'Distrito Federal': 'DF',
  'Espírito Santo': 'ES', Goiás: 'GO', Maranhão: 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
  'Minas Gerais': 'MG', Pará: 'PA', Paraíba: 'PB', Paraná: 'PR', Pernambuco: 'PE', Piauí: 'PI',
  'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', Rondônia: 'RO', Roraima: 'RR',
  'Santa Catarina': 'SC', 'São Paulo': 'SP', Sergipe: 'SE', Tocantins: 'TO',
};

export function toCities(json: unknown): City[] {
  return arr((json as Raw | null)?.results).flatMap((item) => {
    const r = item as Raw;
    const latitude = num(r.latitude);
    const longitude = num(r.longitude);
    if (typeof r.name !== 'string' || latitude === null || longitude === null) return [];
    const admin = typeof r.admin1 === 'string' ? r.admin1 : '';
    return [{
      id: String(r.id ?? `${latitude},${longitude}`),
      name: r.name,
      region: UF[admin] ?? admin,
      latitude,
      longitude,
      timezone: typeof r.timezone === 'string' ? r.timezone : 'auto',
    }];
  });
}

export async function searchCities(query: string, signal?: AbortSignal): Promise<City[]> {
  const params = new URLSearchParams({ name: query, count: '8', language: 'pt', format: 'json', countryCode: 'BR' });
  return toCities(await getJson(`${GEOCODING_URL}?${params}`, signal));
}
