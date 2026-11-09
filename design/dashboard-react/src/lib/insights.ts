import type { CurrentReading, HourReading } from '../types';

export type Advice = { tone: 'calm' | 'heads-up' | 'rain' | 'storm'; text: string };

/**
 * A frase do topo segue a regra do "Vai chover?" do app real:
 * chuva = ≥ 0,5 mm ou ≥ 50% com volume; possibilidade = ≥ 30%; trovoada pelos códigos 95/96/99.
 * Uma hora ausente encerra a cobertura: ausência nunca vira "sem chuva".
 */
export function rainAdvice(hours: HourReading[], current: CurrentReading, timeZone: string, horizon = 12): Advice | null {
  const clock = (at: Date) => clockIn(at, timeZone);
  if (current.code !== null && current.code >= 95) return { tone: 'storm', text: 'Trovoada agora. Fique em local abrigado.' };
  if (current.code !== null && current.code >= 51) return { tone: 'rain', text: 'Chovendo agora. Leve um guarda-chuva.' };

  let maybe: HourReading | null = null;
  let covered = 0;
  for (const hour of hours.slice(0, horizon)) {
    if (hour.rainMm === null || hour.rainChance === null) break;
    covered += 1;
    if (hour.code !== null && hour.code >= 95) return { tone: 'storm', text: `Trovoada prevista por volta das ${clock(hour.at)}.` };
    const wet = hour.rainMm >= 0.5 || (hour.rainChance >= 50 && hour.rainMm > 0);
    if (wet) return { tone: 'rain', text: `Leve um guarda-chuva: chuva a partir das ${clock(hour.at)}.` };
    if (!maybe && hour.rainChance >= 30) maybe = hour;
  }
  if (maybe) return { tone: 'heads-up', text: `Pode chover a partir das ${clock(maybe.at)} (${Math.round(maybe.rainChance ?? 0)}%).` };
  if (covered === 0) return null;
  return { tone: 'calm', text: `Sem chuva nas próximas ${covered} horas.` };
}

const formatters = new Map<string, Intl.DateTimeFormat>();
/** Relógio no fuso da cidade, nunca no do aparelho. Formatadores guardados (criar um custa ~1 ms no celular). */
export function clockIn(at: Date, timeZone: string): string {
  let f = formatters.get(timeZone);
  if (!f) {
    if (formatters.size > 20) formatters.clear();
    f = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone });
    formatters.set(timeZone, f);
  }
  return f.format(at);
}

export function uvLabel(uv: number | null): string {
  if (uv === null) return 'Indisponível';
  const value = Math.round(uv);
  if (value <= 2) return 'Baixo';
  if (value <= 5) return 'Moderado';
  if (value <= 7) return 'Alto';
  if (value <= 10) return 'Muito alto';
  return 'Extremo';
}

export function humidityLabel(humidity: number | null): string {
  if (humidity === null) return 'Indisponível';
  if (humidity < 12) return 'Emergência: ar muito seco';
  if (humidity < 20) return 'Alerta: ar seco';
  if (humidity < 30) return 'Atenção: ar seco';
  if (humidity < 50) return 'Um pouco seco';
  if (humidity < 70) return 'Confortável';
  if (humidity < 85) return 'Úmido';
  return 'Muito úmido';
}

const SECTORS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
export function windSector(degrees: number | null): string | null {
  if (degrees === null) return null;
  return SECTORS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8] ?? null;
}

/** Maior chance de chuva nas próximas horas, só com leituras presentes. */
export function nextRainChance(hours: HourReading[], horizon = 6): number | null {
  const values = hours.slice(0, horizon).map((h) => h.rainChance);
  if (values.length === 0 || values.some((v) => v === null)) return null;
  return Math.max(...(values as number[]));
}
