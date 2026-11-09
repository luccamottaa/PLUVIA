import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useId, useRef, useState } from 'react';
import { useCitySearch } from '../hooks/useCitySearch';
import type { City } from '../types';

const spring = { type: 'spring', stiffness: 520, damping: 32, mass: 0.7 } as const;

type Props = {
  recents: City[];
  onChoose: (city: City) => void;
  onLocate: () => void;
  locating: boolean;
  locateMessage: string | null;
};

/** Combobox acessível: autocomplete, recentes com o campo vazio e "Usar minha localização" só no toque. */
export function SearchBar({ recents, onChoose, onLocate, locating, locateMessage }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const reduced = useReducedMotion();
  const search = useCitySearch(query);

  const typing = query.trim().length >= 2;
  const options = typing ? search.results : recents;
  const show = open && (options.length > 0 || typing);

  const choose = (city: City) => {
    onChoose(city);
    setQuery('');
    setOpen(false);
    input.current?.blur();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, options.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter' && show && options[active]) { event.preventDefault(); choose(options[active]); }
    else if (event.key === 'Escape') { setOpen(false); }
  };

  const status = typing
    ? search.status === 'loading' ? 'Procurando…'
      : search.status === 'error' ? 'Não deu para buscar agora. Tente de novo.'
      : search.status === 'done' && options.length === 0 ? 'Nenhuma cidade com esse nome.' : ''
    : '';

  return (
    <div className="relative w-full max-w-md">
      <div className="glass flex h-12 items-center gap-2 rounded-full pl-4 pr-1.5 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-brand">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-muted">
          <circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" />
        </svg>
        <label htmlFor={`${listId}-input`} className="sr-only">Buscar cidade</label>
        <input
          id={`${listId}-input`}
          ref={input}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
          placeholder="Buscar cidade"
          autoComplete="off"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={show}
          aria-controls={listId}
          aria-autocomplete="list"
          {...(show && options[active] ? { 'aria-activedescendant': `${listId}-${active}` } : {})}
          className="min-w-0 flex-1 bg-transparent text-base text-ink placeholder:text-muted focus-visible:outline-none"
        />
        <AnimatePresence>
          {search.status === 'loading' && typing && (
            <motion.span
              key="spinner"
              initial={reduced ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={spring}
              className="size-5 shrink-0 rounded-full border-2 border-brand/30 border-t-brand motion-safe:animate-spin"
              aria-hidden="true"
            />
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-glass disabled:opacity-60"
          aria-label={locating ? 'Localizando…' : 'Usar minha localização'}
          title="Usar minha localização"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={locating ? 'motion-safe:animate-pulse' : ''}>
            <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" />
          </svg>
        </button>
      </div>

      <p role="status" className="sr-only">{status || locateMessage || ''}</p>
      {locateMessage && <p className="mt-2 px-4 text-sm text-muted">{locateMessage}</p>}

      <AnimatePresence>
        {show && (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
            transition={spring}
            style={{ transformOrigin: 'top center' }}
            className="absolute inset-x-0 top-14 z-20 overflow-hidden popover rounded-3xl border border-card-border p-2 shadow-2xl shadow-black/30"
          >
            {!typing && <p className="px-3 pb-1 pt-2 text-[.8125rem] text-muted">Recentes</p>}
            <ul id={listId} role="listbox" aria-label={typing ? 'Cidades encontradas' : 'Cidades recentes'}>
              {options.map((city, index) => (
                <motion.li
                  key={city.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  initial={reduced ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: reduced ? 0 : index * 0.03 }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(city)}
                  onMouseEnter={() => setActive(index)}
                  className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-2xl px-3 py-2.5 ${index === active ? 'bg-glass' : ''}`}
                >
                  <span className="truncate text-ink">{city.name}</span>
                  {city.region && <span className="shrink-0 rounded-full border border-line px-2 py-0.5 text-xs text-muted">{city.region}</span>}
                </motion.li>
              ))}
            </ul>
            {status && <p className="px-3 py-3 text-sm text-muted">{status}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
