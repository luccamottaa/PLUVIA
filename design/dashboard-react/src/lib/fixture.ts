/** Resposta do Open-Meteo no formato real (timezone=auto), usada nos testes e no preview sem rede. */
export function openMeteoFixture(start = '2026-11-09T14:00', overrides: { rain?: (number | null)[]; chance?: (number | null)[]; code?: number } = {}) {
  const [date, time] = start.split('T') as [string, string];
  const startHour = Number(time.slice(0, 2));
  const times: string[] = [];
  for (let i = -1; i < 25; i += 1) {
    const h = startHour + i;
    const day = Number(date.slice(8, 10)) + Math.floor(h / 24);
    times.push(`${date.slice(0, 8)}${String(day).padStart(2, '0')}T${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`);
  }
  const n = times.length;
  const rain = overrides.rain ?? Array.from({ length: n }, (_, i) => (i === 6 ? 1.2 : 0));
  const chance = overrides.chance ?? Array.from({ length: n }, (_, i) => (i === 6 ? 70 : 10));
  return {
    timezone: 'America/Manaus',
    utc_offset_seconds: -4 * 3600,
    current: {
      time: start, temperature_2m: 31.4, apparent_temperature: 36.2, relative_humidity_2m: 62,
      wind_speed_10m: 11, wind_gusts_10m: 27, wind_direction_10m: 90, uv_index: 7.6, weather_code: overrides.code ?? 2, is_day: 1,
    },
    hourly: {
      time: times,
      temperature_2m: times.map((_, i) => 31 - i * 0.3),
      weather_code: times.map((_, i) => (i === 6 ? 61 : 2)),
      is_day: times.map((t) => (Number(t.slice(11, 13)) >= 6 && Number(t.slice(11, 13)) < 18 ? 1 : 0)),
      precipitation: rain,
      precipitation_probability: chance,
      relative_humidity_2m: times.map((_, i) => 60 + i),
      uv_index: times.map((_, i) => Math.max(0, 8 - i)),
      wind_speed_10m: times.map((_, i) => 8 + (i % 5)),
    },
    daily: {
      time: ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'],
      weather_code: [2, 61, 95, 3, 80, 1, 0],
      temperature_2m_max: [33, 31, 30, 32, 29, 34, 35],
      temperature_2m_min: [24, 23, 23, 24, 22, 25, 25],
      precipitation_probability_max: [70, 85, 90, 15, 60, 5, null],
      precipitation_sum: [1.2, 12.4, 25, 0, 4.1, 0, null],
    },
  };
}
