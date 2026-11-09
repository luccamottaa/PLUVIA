import { useEffect, useRef, useState } from 'react';
import { fetchForecast, WeatherError } from '../lib/open-meteo';
import type { City, Forecast, LoadState } from '../types';

/**
 * Uma consulta por cidade. Trocar de cidade cancela a anterior e a resposta atrasada
 * nunca pinta a cidade nova (o AbortController + a checagem da revisão garantem isso).
 */
export function useWeather(city: City | null, attempt = 0, load = fetchForecast): LoadState {
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const revision = useRef(0);
  const last = useRef<Forecast | undefined>(undefined);

  useEffect(() => {
    if (!city) return;
    const rev = ++revision.current;
    const controller = new AbortController();
    // Outra cidade: o dado antigo não pode aparecer como se fosse desta.
    const previous = last.current?.city.id === city.id ? last.current : undefined;
    setState(previous ? { status: 'loading', previous } : { status: 'loading' });

    load(city, controller.signal).then(
      (data) => {
        if (rev !== revision.current) return;
        last.current = data;
        setState({ status: 'ready', data });
      },
      (error: unknown) => {
        if (rev !== revision.current) return;
        if (error instanceof WeatherError && error.code === 'cancelled') return;
        const message = error instanceof WeatherError ? error.message : 'Não deu para consultar a previsão.';
        setState(previous ? { status: 'error', message, previous } : { status: 'error', message });
      },
    );
    return () => controller.abort();
  }, [city, attempt, load]);

  return state;
}
