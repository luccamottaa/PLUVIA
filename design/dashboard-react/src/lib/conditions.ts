import type { SkyMood, WmoCode } from '../types';

const LABELS: Record<number, string> = {
  0: 'Céu limpo', 1: 'Poucas nuvens', 2: 'Parcialmente nublado', 3: 'Nublado',
  45: 'Neblina', 48: 'Neblina com geada',
  51: 'Garoa fraca', 53: 'Garoa', 55: 'Garoa forte', 56: 'Garoa congelante', 57: 'Garoa congelante',
  61: 'Chuva fraca', 63: 'Chuva', 65: 'Chuva forte', 66: 'Chuva congelante', 67: 'Chuva congelante',
  71: 'Neve fraca', 73: 'Neve', 75: 'Neve forte', 77: 'Grãos de neve',
  80: 'Pancadas fracas', 81: 'Pancadas de chuva', 82: 'Pancadas fortes',
  85: 'Pancadas de neve', 86: 'Pancadas de neve',
  95: 'Trovoada', 96: 'Trovoada com granizo', 99: 'Trovoada com granizo',
};

export function conditionLabel(code: WmoCode | null): string {
  if (code === null) return 'Condição indisponível';
  return LABELS[code] ?? 'Condição indisponível';
}

export function skyMood(code: WmoCode | null): SkyMood {
  if (code === null) return 'cloud';
  if (code >= 95) return 'storm';
  if (code >= 71 && code <= 77) return 'snow';
  if (code === 85 || code === 86) return 'snow';
  if (code >= 51) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code === 3) return 'cloud';
  return 'clear';
}
