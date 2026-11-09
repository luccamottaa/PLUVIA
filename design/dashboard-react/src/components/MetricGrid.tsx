import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { humidityLabel, uvLabel, windSector } from '../lib/insights';
import type { CurrentReading, HourLens } from '../types';
import { rise } from './motion';

function MetricCard({ label, value, unit, note, children, selected, onSelect }: {
  label: string; value: string; unit?: string; note: string; children?: ReactNode; selected: boolean; onSelect: () => void;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      variants={rise}
      whileHover={reduced ? {} : { scale: 1.02 }}
      whileTap={reduced ? {} : { scale: 0.98 }}
      onClick={onSelect}
      aria-pressed={selected}
      data-interactive=""
      className={`card flex min-h-36 flex-col items-start gap-1 p-4 text-left ${selected ? 'border-brand/60' : ''}`}
    >
      <span className="text-[.875rem] text-muted">{label}</span>
      <span className="tabular text-[2rem] font-light leading-none">
        {value}
        {unit && <sup className="ml-0.5 text-[.5em] font-semibold">{unit}</sup>}
      </span>
      <span className="text-[.875rem] text-muted">{note}</span>
      {children}
      <span className="sr-only">Ver por hora</span>
    </motion.button>
  );
}

export function MetricGrid({ current, rainChance, lens, onLens }: {
  current: CurrentReading; rainChance: number | null; lens: HourLens; onLens: (lens: HourLens) => void;
}) {
  const uv = current.uvIndex === null ? null : Math.round(current.uvIndex);
  const sector = windSector(current.windDirection);
  return (
    <motion.div variants={{ show: { transition: { staggerChildren: 0.06 } } }} className="grid grid-cols-2 gap-3">
      <MetricCard label="Umidade" value={current.humidity === null ? '--' : `${Math.round(current.humidity)}`} unit="%"
        note={humidityLabel(current.humidity)} selected={lens === 'humidity'} onSelect={() => onLens('humidity')} />

      <MetricCard label="Índice UV" value={uv === null ? '--' : String(uv)} note={uvLabel(current.uvIndex)}
        selected={lens === 'uv'} onSelect={() => onLens('uv')}>
        <span className="relative mt-auto h-1.5 w-full rounded-full bg-[linear-gradient(90deg,#3fd17a,#f3d046,#f08c1e,#e1534b,#9b5de5)]" aria-hidden="true">
          {uv !== null && (
            <span className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-ink"
              style={{ left: `${Math.min(uv, 11) / 11 * 100}%` }} />
          )}
        </span>
      </MetricCard>

      <MetricCard label="Vento" value={current.windSpeed === null ? '--' : `${Math.round(current.windSpeed)}`} unit="km/h"
        note={current.windGusts === null ? (sector ? `Do ${sector}` : 'Rajadas indisponíveis') : `Rajadas ${Math.round(current.windGusts)} km/h`}
        selected={lens === 'wind'} onSelect={() => onLens('wind')}>
        {current.windDirection !== null && (
          <span className="mt-auto flex items-center gap-1.5 text-[.8125rem] text-muted">
            {/* A seta aponta para onde o vento vai (direção de origem + 180°). */}
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${current.windDirection + 180}deg)` }} className="text-brand">
              <path d="M12 3 7 14h10L12 3Z" fill="currentColor" /><path d="M12 14v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {sector && <span>Vem do {sector}</span>}
          </span>
        )}
      </MetricCard>

      <MetricCard label="Chance de chuva" value={rainChance === null ? '--' : `${Math.round(rainChance)}`} unit="%"
        note="Maior chance nas próximas 6 h" selected={lens === 'rain'} onSelect={() => onLens('rain')} />
    </motion.div>
  );
}
