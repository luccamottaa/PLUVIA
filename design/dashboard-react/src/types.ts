/** Contrato normalizado que os componentes consomem. Nenhum componente lê o JSON cru da API. */

export interface City {
  id: string;
  name: string;
  /** Sigla do estado (AM, SP…) ou região/país quando fora do Brasil. */
  region: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

/** Condição em códigos WMO (os mesmos do Open-Meteo e do app real). */
export type WmoCode = number;

export type SkyMood = 'clear' | 'cloud' | 'rain' | 'storm' | 'fog' | 'snow';

/** Valores ausentes são `null`: nunca viram zero nem "tempo tranquilo". */
export interface CurrentReading {
  at: Date;
  temperature: number | null;
  apparent: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windGusts: number | null;
  windDirection: number | null;
  uvIndex: number | null;
  code: WmoCode | null;
  isDay: boolean;
}

export interface HourReading {
  /** Início da hora, já com o offset do fuso da cidade. */
  at: Date;
  temperature: number | null;
  code: WmoCode | null;
  isDay: boolean;
  /** Chuva e chance do intervalo que COMEÇA em `at` (Open-Meteo guarda no fim do intervalo: i+1). */
  rainMm: number | null;
  rainChance: number | null;
  humidity: number | null;
  uvIndex: number | null;
  windSpeed: number | null;
}

/** O que a fileira de horas mostra; os cartões de métrica trocam esta lente. */
export type HourLens = 'condition' | 'rain' | 'humidity' | 'uv' | 'wind';

export interface DayReading {
  /** Data do calendário municipal, ancorada em UTC (formatar com timeZone:'UTC'). */
  date: Date;
  code: WmoCode | null;
  min: number | null;
  max: number | null;
  rainChance: number | null;
  rainMm: number | null;
}

export interface Forecast {
  city: City;
  fetchedAt: Date;
  current: CurrentReading;
  hours: HourReading[];
  days: DayReading[];
}

export type LoadState =
  | { status: 'idle' }
  | { status: 'loading'; previous?: Forecast }
  | { status: 'ready'; data: Forecast }
  | { status: 'error'; message: string; previous?: Forecast };
