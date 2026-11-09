import { describe, expect, it } from 'vitest';
import type { City } from '../types';
import { openMeteoFixture } from './fixture';
import { humidityLabel, nextRainChance, rainAdvice, uvLabel, windSector } from './insights';
import { toForecast } from './open-meteo';

const city: City = { id: 'x', name: 'Manaus', region: 'AM', latitude: -3.1, longitude: -60, timezone: 'America/Manaus' };
const now = new Date('2026-11-09T18:10:00Z');
const tz = 'America/Manaus';

describe('rainAdvice', () => {
  it('pede guarda-chuva na primeira hora com chuva, no relógio da cidade', () => {
    const f = toForecast(openMeteoFixture(), city, now);
    expect(rainAdvice(f.hours, f.current, tz)).toEqual({ tone: 'rain', text: 'Leve um guarda-chuva: chuva a partir das 18:00.' });
  });

  it('chance média sem volume vira "pode chover"', () => {
    const f = toForecast(openMeteoFixture(undefined, { rain: Array(26).fill(0), chance: Array(26).fill(0).map((_, i) => (i === 3 ? 40 : 5)) }), city, now);
    expect(rainAdvice(f.hours, f.current, tz)).toEqual({ tone: 'heads-up', text: 'Pode chover a partir das 15:00 (40%).' });
  });

  it('hora ausente encerra a cobertura e não vira "sem chuva" no dia todo', () => {
    const rain = Array(26).fill(0); rain[4] = null;
    const f = toForecast(openMeteoFixture(undefined, { rain, chance: Array(26).fill(0) }), city, now);
    expect(rainAdvice(f.hours, f.current, tz)).toEqual({ tone: 'calm', text: 'Sem chuva nas próximas 2 horas.' });
    const none = Array(26).fill(null);
    const g = toForecast(openMeteoFixture(undefined, { rain: none, chance: none }), city, now);
    expect(rainAdvice(g.hours, g.current, tz)).toBeNull();
  });

  it('trovoada agora vence tudo', () => {
    const f = toForecast(openMeteoFixture(undefined, { code: 95 }), city, now);
    expect(rainAdvice(f.hours, f.current, tz)?.tone).toBe('storm');
  });
});

describe('rótulos', () => {
  it('classifica UV, umidade e vento', () => {
    expect(uvLabel(7.6)).toBe('Muito alto');
    expect(uvLabel(null)).toBe('Indisponível');
    expect(humidityLabel(25)).toBe('Atenção: ar seco');
    expect(windSector(90)).toBe('L');
    expect(windSector(-45)).toBe('NO');
    expect(nextRainChance([])).toBeNull();
  });
});
