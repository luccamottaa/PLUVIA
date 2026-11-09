import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { conditionLabel } from '../lib/conditions';
import { hourLabel, temp } from '../lib/format';
import type { HourLens, HourReading } from '../types';
import { WeatherIcon } from './WeatherIcon';

const W = 64; // largura de cada hora em px
const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const;

const LENSES: { id: HourLens; label: string }[] = [
  { id: 'condition', label: 'Condição' },
  { id: 'rain', label: 'Chuva' },
  { id: 'humidity', label: 'Umidade' },
  { id: 'uv', label: 'UV' },
  { id: 'wind', label: 'Vento' },
];

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const mm = (v: number | null) => (v === null ? '--' : decimal.format(v));

function valueFor(hour: HourReading, lens: HourLens): string {
  switch (lens) {
    case 'rain': return hour.rainChance === null ? '—' : `${Math.round(hour.rainChance)}%`;
    case 'humidity': return hour.humidity === null ? '—' : `${Math.round(hour.humidity)}%`;
    case 'uv': return hour.uvIndex === null ? '—' : String(Math.round(hour.uvIndex));
    case 'wind': return hour.windSpeed === null ? '—' : `${Math.round(hour.windSpeed)}`;
    default: return `${temp(hour.temperature)}°`;
  }
}

function describe(hour: HourReading, index: number, timeZone: string): string {
  const when = index === 0 ? 'Agora' : `${hourLabel(hour.at, timeZone)}h`;
  const rain = hour.rainChance === null ? 'chuva indisponível' : `chance de chuva ${Math.round(hour.rainChance)}% (${mm(hour.rainMm)} mm)`;
  return `${when}: ${conditionLabel(hour.code)}, ${temp(hour.temperature)}°, ${rain}`;
}

/**
 * Fileira de 24 horas com uma bolha de vidro que se arrasta (mouse ou dedo) e assenta por mola na hora mais perto.
 * Tocar numa hora também move a bolha; pelo teclado, setas/Home/End no slider.
 * A bolha não tem backdrop-filter: por cima do texto, o desfoque deixaria a hora ilegível.
 */
export function HourlyStrip({ hours, timeZone, lens, onLens }: {
  hours: HourReading[]; timeZone: string; lens: HourLens; onLens: (lens: HourLens) => void;
}) {
  const [selected, setSelected] = useState(0);
  const x = useMotionValue(0);
  const scroller = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const last = Math.max(hours.length - 1, 0);

  // Previsão nova (outra cidade): volta para "Agora".
  useEffect(() => { setSelected(0); x.set(0); }, [hours, x]);

  const settle = (index: number) => {
    const i = Math.min(Math.max(index, 0), last);
    setSelected(i);
    if (reduced) x.set(i * W);
    else animate(x, i * W, spring);
    const el = scroller.current;
    if (el && (i * W < el.scrollLeft || (i + 1) * W > el.scrollLeft + el.clientWidth)) {
      el.scrollTo({ left: i * W - (el.clientWidth - W) / 2, behavior: reduced ? 'auto' : 'smooth' });
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, PageDown: 6, PageUp: -6 };
    if (event.key in step) { event.preventDefault(); settle(selected + (step[event.key] ?? 0)); }
    else if (event.key === 'Home') { event.preventDefault(); settle(0); }
    else if (event.key === 'End') { event.preventDefault(); settle(last); }
  };

  const current = hours[selected];
  const maxRain = Math.max(1, ...hours.map((h) => h.rainMm ?? 0));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[1.3rem] font-semibold">Próximas horas</h2>
        <div role="group" aria-label="O que mostrar por hora" className="glass flex w-full rounded-full p-1 sm:w-auto">
          {LENSES.map((item) => (
            <button key={item.id} type="button" aria-pressed={lens === item.id} onClick={() => onLens(item.id)}
              className={`min-h-9 flex-1 rounded-full px-2 text-[.8125rem] sm:flex-none sm:px-3 transition-colors ${lens === item.id ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'}`}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={scroller} className="no-scrollbar -mx-1 overflow-x-auto px-1 py-1">
        <div
          ref={track}
          role="slider"
          tabIndex={0}
          aria-label="Hora selecionada"
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={selected}
          aria-valuetext={current ? describe(current, selected, timeZone) : 'Sem dados'}
          onKeyDown={onKeyDown}
          className="relative flex rounded-2xl"
          style={{ width: hours.length * W }}
        >
          {hours.map((hour, index) => (
            <button key={hour.at.getTime()} type="button" tabIndex={-1} aria-hidden="true" onClick={() => settle(index)}
              className="relative z-0 flex h-32 shrink-0 flex-col items-center justify-between py-3" style={{ width: W }}>
              <span className={`tabular text-[.8125rem] ${index === 0 ? 'font-semibold text-brand' : 'text-muted'}`}>
                {index === 0 ? 'Agora' : `${hourLabel(hour.at, timeZone)}h`}
              </span>
              {lens === 'rain' ? (
                <span className="flex h-9 w-2 items-end overflow-hidden rounded-full bg-line">
                  {/* Altura só pelo volume; a chance fica no número, nunca aumenta a barra. */}
                  <span className="w-full rounded-full bg-gradient-to-b from-rain-top to-rain-bottom"
                    style={{ height: `${Math.sqrt((hour.rainMm ?? 0) / maxRain) * 100}%`, opacity: hour.rainMm === null ? 0.3 : 1 }} />
                </span>
              ) : (
                <WeatherIcon code={hour.code} isDay={hour.isDay} size={28} />
              )}
              <span className="tabular text-[1.0625rem]">{valueFor(hour, lens)}</span>
            </button>
          ))}

          {hours.length > 0 && (
            <motion.div
              aria-hidden="true"
              drag="x"
              dragConstraints={track}
              dragElastic={0.06}
              dragMomentum={false}
              whileDrag={reduced ? {} : { scaleY: 1.06, scaleX: 1.12 }}
              onDrag={() => {
                const i = Math.min(Math.max(Math.round(x.get() / W), 0), last);
                if (i !== selected) setSelected(i);
              }}
              onDragEnd={() => settle(Math.round(x.get() / W))}
              style={{ x, width: W, touchAction: 'none' }}
              className="absolute inset-y-0 left-0 z-10 cursor-grab rounded-2xl border border-glass-edge bg-[linear-gradient(170deg,#ffffff2b,#ffffff0a)] shadow-[inset_0_1px_0_#ffffff66,inset_0_-1px_0_#ffffff1f,0_6px_18px_#0000002e] active:cursor-grabbing"
            />
          )}
        </div>
      </div>

      <p className="tabular mt-3 min-h-6 text-[.9375rem] text-muted" aria-hidden="true">
        {current ? describe(current, selected, timeZone) : ''}
      </p>
    </div>
  );
}
