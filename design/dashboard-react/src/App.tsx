import { motion, useReducedMotion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DailyForecast } from './components/DailyForecast';
import { Hero } from './components/Hero';
import { HourlyStrip } from './components/HourlyStrip';
import { MetricGrid } from './components/MetricGrid';
import { rise, stagger } from './components/motion';
import { SearchBar } from './components/SearchBar';
import { SkyBackdrop } from './components/SkyBackdrop';
import { useWeather } from './hooks/useWeather';
import { skyMood } from './lib/conditions';
import { clockIn, nextRainChance, rainAdvice } from './lib/insights';
import { pushRecent, readRecents } from './lib/storage';
import type { City, Forecast, HourLens } from './types';

const MANAUS: City = { id: '1302603', name: 'Manaus', region: 'AM', latitude: -3.119, longitude: -60.0217, timezone: 'America/Manaus' };

export default function App() {
  const [city, setCity] = useState<City>(() => readRecents()[0] ?? MANAUS);
  const [recents, setRecents] = useState<City[]>(readRecents);
  const [attempt, setAttempt] = useState(0);
  const [lens, setLens] = useState<HourLens>('condition');
  const [locating, setLocating] = useState(false);
  const [locateMessage, setLocateMessage] = useState<string | null>(null);
  const state = useWeather(city, attempt);
  const reduced = useReducedMotion();

  const data: Forecast | undefined =
    state.status === 'ready' ? state.data : state.status === 'loading' || state.status === 'error' ? state.previous : undefined;
  const mood = skyMood(data?.current.code ?? null);
  const phase = data ? (data.current.isDay ? 'day' : 'night') : 'night';

  // O céu manda nas cores: fase e condição ficam na raiz, como no app.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.phase = phase;
    root.dataset.weather = mood;
  }, [phase, mood]);

  const choose = useCallback((next: City) => {
    setLocateMessage(null);
    setLens('condition');
    setCity(next);
    setRecents(pushRecent(next));
  }, []);

  // Localização só depois do toque: nunca pedir permissão sozinho na abertura.
  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) { setLocateMessage('Este navegador não informa a localização. Digite o nome da sua cidade.'); return; }
    setLocating(true);
    setLocateMessage(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        setLens('condition');
        setCity({ id: 'gps', name: 'Sua localização', region: '', latitude: coords.latitude, longitude: coords.longitude, timezone: 'auto' });
      },
      (error) => {
        setLocating(false);
        setLocateMessage(error.code === error.PERMISSION_DENIED
          ? 'Localização bloqueada. Digite o nome da sua cidade.'
          : 'Não deu para achar você agora. Digite o nome da sua cidade.');
      },
      { timeout: 10_000, maximumAge: 600_000 },
    );
  }, []);

  const advice = useMemo(() => (data ? rainAdvice(data.hours, data.current, data.city.timezone) : null), [data]);
  const rainChance = useMemo(() => (data ? nextRainChance(data.hours) : null), [data]);

  return (
    <>
      <SkyBackdrop mood={mood} />
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-card focus:px-4 focus:py-2">
        Pular para a previsão
      </a>

      <header className="mx-auto flex max-w-[1180px] flex-col items-center gap-4 px-4 pb-2 pt-[max(16px,env(safe-area-inset-top))] sm:flex-row sm:justify-between">
        <span className="font-brand text-[1.32rem] font-black tracking-tight text-brand">PLUVIA</span>
        <SearchBar recents={recents} onChoose={choose} onLocate={locate} locating={locating} locateMessage={locateMessage} />
      </header>

      <main id="conteudo" aria-busy={state.status === 'loading'} className="mx-auto max-w-[1180px] px-4 pb-[max(32px,env(safe-area-inset-bottom))]">
        <p role="status" className="min-h-6 text-center text-[.875rem] text-muted">
          {state.status === 'loading' && state.previous ? `Atualizando… leitura das ${clockIn(state.previous.fetchedAt, state.previous.city.timezone)}` : ''}
          {state.status === 'error' && state.previous ? `${state.message} Mostrando a leitura das ${clockIn(state.previous.fetchedAt, state.previous.city.timezone)}.` : ''}
        </p>

        {state.status === 'error' && !state.previous && (
          <div className="card mx-auto mt-10 max-w-md p-6 text-center">
            <p className="text-lg">{state.message}</p>
            <button type="button" onClick={() => setAttempt((n) => n + 1)}
              className="mt-4 min-h-11 rounded-full bg-brand px-6 font-semibold text-on-brand">Tentar de novo</button>
          </div>
        )}

        {!data && state.status !== 'error' && <Skeleton />}

        {data && (
          <motion.div
            key={data.city.id}
            variants={stagger}
            initial={reduced ? false : 'hidden'}
            animate="show"
            className="grid gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_380px] min-[1100px]:items-start"
          >
            <div className="flex min-w-0 flex-col gap-4">
              <Hero cityName={data.city.name} region={data.city.region} current={data.current} today={data.days[0]} advice={advice} />
              <motion.section variants={rise} aria-label="Leituras de agora" className="min-[1100px]:hidden">
                <MetricGrid current={data.current} rainChance={rainChance} lens={lens} onLens={setLens} />
              </motion.section>
              <motion.section variants={rise} className="card min-w-0 p-5">
                <HourlyStrip hours={data.hours} timeZone={data.city.timezone} lens={lens} onLens={setLens} />
              </motion.section>
              <motion.section variants={rise} className="card p-5">
                <DailyForecast days={data.days} />
              </motion.section>
            </div>
            <motion.aside variants={rise} aria-label="Leituras de agora" className="hidden min-[1100px]:sticky min-[1100px]:top-6 min-[1100px]:block">
              <MetricGrid current={data.current} rainChance={rainChance} lens={lens} onLens={setLens} />
            </motion.aside>
          </motion.div>
        )}
      </main>
    </>
  );
}

/** Esqueleto parado (sem brilho animado): reserva as alturas finais para a chegada dos dados não pular a página. */
function Skeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col items-center gap-4 pt-6">
      <div className="h-9 w-48 rounded-full bg-line" />
      <div className="h-28 w-40 rounded-3xl bg-line" />
      <div className="h-6 w-56 rounded-full bg-line" />
      <div className="mt-6 grid w-full grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="card h-36" />)}
      </div>
      <div className="card h-56 w-full" />
    </div>
  );
}
