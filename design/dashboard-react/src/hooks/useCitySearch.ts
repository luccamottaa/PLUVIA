import { useEffect, useState } from 'react';
import { searchCities, WeatherError } from '../lib/open-meteo';
import type { City } from '../types';

export type SearchState = { status: 'idle' | 'loading' | 'done' | 'error'; results: City[] };

const DEBOUNCE_MS = 220;
const cache = new Map<string, City[]>();

export function normalize(query: string): string {
  return query.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
}

/** Autocomplete com debounce, cache curto e cancelamento: só a última digitação chega à tela. */
export function useCitySearch(query: string, search = searchCities): SearchState {
  const [state, setState] = useState<SearchState>({ status: 'idle', results: [] });

  useEffect(() => {
    const key = normalize(query);
    if (key.length < 2) {
      setState({ status: 'idle', results: [] });
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      setState({ status: 'done', results: cached });
      return;
    }
    const controller = new AbortController();
    setState((s) => ({ status: 'loading', results: s.results }));
    const timer = setTimeout(() => {
      search(query.trim(), controller.signal).then(
        (results) => {
          if (cache.size > 40) cache.clear();
          cache.set(key, results);
          setState({ status: 'done', results });
        },
        (error: unknown) => {
          if (error instanceof WeatherError && error.code === 'cancelled') return;
          setState({ status: 'error', results: [] });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, search]);

  return state;
}
