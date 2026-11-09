import { motion } from 'framer-motion';
import { conditionLabel } from '../lib/conditions';
import { temp } from '../lib/format';
import type { Advice } from '../lib/insights';
import type { CurrentReading, DayReading } from '../types';
import { rise } from './motion';
import { WeatherIcon } from './WeatherIcon';

const TONE: Record<Advice['tone'], string> = {
  calm: 'text-muted',
  'heads-up': 'text-ink',
  rain: 'text-ink',
  storm: 'text-alert-yellow',
};

export function Hero({ cityName, region, current, today, advice }: {
  cityName: string; region: string; current: CurrentReading; today: DayReading | undefined; advice: Advice | null;
}) {
  return (
    <motion.section variants={rise} aria-labelledby="hero-city" className="flex flex-col items-center px-4 pb-4 pt-6 text-center">
      <h1 id="hero-city" className="max-w-full truncate text-[clamp(1.9rem,8.7vw,2.65rem)] font-normal leading-tight">
        {cityName}
        {region && <span className="sr-only">, {region}</span>}
      </h1>

      {/* Algarismos no eixo; o grau fica pendurado à direita por um grau invisível do outro lado. */}
      <p className="flex items-start justify-center font-extralight leading-none tracking-tight text-[clamp(5.35rem,24.5vw,7.5rem)]" aria-label={`${temp(current.temperature)} graus`}>
        <span aria-hidden="true" className="invisible text-[.72em]">°</span>
        <span aria-hidden="true">{temp(current.temperature)}</span>
        <span aria-hidden="true" className="text-[.72em]">°</span>
      </p>

      <p className="-mt-1 flex items-center gap-2 text-[clamp(1.05rem,5vw,1.25rem)] font-medium">
        <WeatherIcon code={current.code} isDay={current.isDay} size={26} />
        {conditionLabel(current.code)}
      </p>
      <p className="tabular mt-1 flex flex-wrap justify-center gap-x-2 text-[clamp(1rem,4.6vw,1.25rem)] font-medium text-muted">
        <span className="whitespace-nowrap">Sensação {temp(current.apparent)}°</span>
        <span className="whitespace-nowrap">Máx. {temp(today?.max ?? null)}°</span>
        <span className="whitespace-nowrap">Mín. {temp(today?.min ?? null)}°</span>
      </p>

      {advice && (
        <p className={`glass mt-5 inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-left text-balance text-[.9375rem] ${TONE[advice.tone]}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="shrink-0">
            <path d="M3 12a9 9 0 0 1 18 0H3ZM12 12v6.5a2 2 0 0 1-4 0" />
          </svg>
          {advice.text}
        </p>
      )}
    </motion.section>
  );
}
