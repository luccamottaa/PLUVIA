import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import { conditionLabel } from '../lib/conditions';
import { temp, weekday } from '../lib/format';
import type { DayReading } from '../types';
import { WeatherIcon } from './WeatherIcon';

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** 7 dias com uma escala comum: as barras de mínima-máxima são comparáveis entre os dias. */
export function DailyForecast({ days }: { days: DayReading[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const reduced = useReducedMotion();
  const mins = days.map((d) => d.min).filter((v): v is number => v !== null);
  const maxs = days.map((d) => d.max).filter((v): v is number => v !== null);
  const low = mins.length ? Math.min(...mins) : 0;
  const high = maxs.length ? Math.max(...maxs) : 1;
  const span = Math.max(high - low, 1);

  return (
    <div>
      <h2 className="mb-2 text-[1.3rem] font-semibold">Próximos 7 dias</h2>
      <ul className="divide-y divide-line">
        {days.map((day, index) => {
          const expanded = open === index;
          const showRain = day.rainChance !== null && day.rainChance >= 20;
          const hasRange = day.min !== null && day.max !== null;
          return (
            <li key={day.date.getTime()}>
              <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : index)}
                className="grid min-h-14 w-full grid-cols-[3.4rem_2.75rem_3rem_minmax(0,1fr)] items-center gap-2 rounded-xl px-1 text-left transition-colors hover:bg-glass sm:grid-cols-[7rem_2.75rem_4rem_minmax(0,1fr)]">
                <span className={index === 0 ? 'font-semibold text-brand' : ''}>
                  <span className="sm:hidden" aria-hidden="true">{weekday(day.date, index, true)}</span>
                  <span className="max-sm:sr-only">{weekday(day.date, index)}</span>
                </span>
                <WeatherIcon code={day.code} isDay size={28} />
                <span className="tabular text-center text-[.8125rem] text-brand">
                  {showRain ? `${Math.round(day.rainChance ?? 0)}%` : ''}
                  <span className="sr-only">{day.rainChance === null ? 'chance de chuva indisponível' : `chance de chuva ${Math.round(day.rainChance)}%`}, {conditionLabel(day.code)}</span>
                </span>
                <span className="tabular grid grid-cols-[2.2rem_minmax(0,1fr)_2.2rem] items-center gap-2">
                  <span className="text-right text-muted">{temp(day.min)}°</span>
                  <span className="relative h-1.5 rounded-full bg-line" aria-hidden="true">
                    {hasRange && (
                      <motion.span
                        className="absolute inset-y-0 rounded-full bg-gradient-to-r from-range-cool via-range-warm to-range-hot"
                        initial={reduced ? false : { scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ type: 'spring', stiffness: 160, damping: 24, delay: reduced ? 0 : 0.1 + index * 0.04 }}
                        style={{ left: `${((day.min! - low) / span) * 100}%`, right: `${((high - day.max!) / span) * 100}%`, transformOrigin: 'left' }}
                      />
                    )}
                  </span>
                  <span>{temp(day.max)}°</span>
                </span>
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={reduced ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 32 }}
                    className="overflow-hidden"
                  >
                    <p className="px-1 pb-3 text-[.9375rem] text-muted">
                      {conditionLabel(day.code)} · chuva {day.rainChance === null ? '—' : `${Math.round(day.rainChance)}%`}
                      {day.rainMm !== null && day.rainMm >= 0.5 ? ` · ${decimal.format(day.rainMm)} mm` : ''}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
