import { describe, expect, it } from 'vitest';
import type { City } from '../types';
import { openMeteoFixture } from './fixture';
import { num, parseLocal, toCities, toForecast, WeatherError } from './open-meteo';

const city: City = { id: '1302603', name: 'Manaus', region: 'AM', latitude: -3.119, longitude: -60.0217, timezone: 'America/Manaus' };
const now = new Date('2026-11-09T18:10:00Z'); // 14:10 em Manaus

describe('toForecast', () => {
  it('interpreta horários com o offset da cidade, não do aparelho', () => {
    expect(parseLocal('2026-11-09T14:00', -4 * 3600)?.toISOString()).toBe('2026-11-09T18:00:00.000Z');
    expect(parseLocal('09/11/2026', 0)).toBeNull();
  });

  it('começa na hora atual e alinha chuva/chance ao intervalo seguinte (i+1)', () => {
    const forecast = toForecast(openMeteoFixture(), city, now);
    expect(forecast.hours).toHaveLength(24);
    expect(forecast.hours[0]?.at.toISOString()).toBe('2026-11-09T18:00:00.000Z');
    // No fixture o índice cru 6 (que termina às 19:00) tem 1,2 mm; ele pertence à hora que começa às 18:00 (índice 4 da lista).
    const wet = forecast.hours.findIndex((h) => h.rainMm === 1.2);
    expect(forecast.hours[wet]?.at.toISOString()).toBe('2026-11-09T22:00:00.000Z');
    expect(forecast.hours[wet]?.rainChance).toBe(70);
  });

  it('valor ausente continua null, nunca zero', () => {
    const json = openMeteoFixture();
    json.current.uv_index = null as unknown as number;
    const forecast = toForecast(json, city, now);
    expect(forecast.current.uvIndex).toBeNull();
    expect(forecast.days[6]?.rainChance).toBeNull();
    expect(num('12')).toBeNull();
    expect(num(Number.NaN)).toBeNull();
  });

  it('recusa resposta incompleta', () => {
    expect(() => toForecast({ current: {} }, city, now)).toThrow(WeatherError);
  });

  it('usa a sigla do estado na busca', () => {
    const cities = toCities({ results: [{ id: 1, name: 'Parintins', admin1: 'Amazonas', latitude: -2.6, longitude: -56.7, timezone: 'America/Manaus' }, { name: 'sem coordenada' }] });
    expect(cities).toEqual([{ id: '1', name: 'Parintins', region: 'AM', latitude: -2.6, longitude: -56.7, timezone: 'America/Manaus' }]);
  });
});
