import type { City } from '../types';

const RECENTS = 'pluvia-recent-cities-v1';
const MAX = 5;

/** Storage pode estar bloqueado (aba privada, preview): toda leitura e escrita é protegida. */
export function readRecents(): City[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENTS) ?? '[]');
    return Array.isArray(parsed) ? (parsed.filter(isCity).slice(0, MAX)) : [];
  } catch {
    return [];
  }
}

export function pushRecent(city: City): City[] {
  const next = [city, ...readRecents().filter((c) => c.id !== city.id)].slice(0, MAX);
  try { localStorage.setItem(RECENTS, JSON.stringify(next)); } catch { /* sem storage: só memória */ }
  return next;
}

function isCity(value: unknown): value is City {
  const c = value as City;
  return !!c && typeof c.id === 'string' && typeof c.name === 'string'
    && Number.isFinite(c.latitude) && Number.isFinite(c.longitude);
}
