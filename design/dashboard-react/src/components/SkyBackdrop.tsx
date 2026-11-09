import { useEffect, useState } from 'react';
import type { SkyMood } from '../types';

// Traços de chuva num tile de 320 × 480 (o deslocamento da animação é exatamente um tile).
const streaks = (opacity: number, width: number) => {
  const lines = Array.from({ length: 22 }, (_, i) => {
    const x = (i * 149) % 320;
    const y = (i * 211) % 480;
    const len = 26 + ((i * 37) % 26);
    return `<path d='M${x + 6} ${y} ${x} ${y + len}'/>`;
  }).join('');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='320' height='480'><g stroke='%23e5f5ff' stroke-opacity='${opacity}' stroke-width='${width}' stroke-linecap='round'>${lines}</g></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/"/g, "'").replace(/#/g, '%23')}")`;
};
const NEAR = streaks(0.55, 1.2);
const FAR = streaks(0.35, 0.8);

/**
 * Céu fixo atrás do conteúdo: chuva com chuva/trovoada, clarão com trovoada.
 * Só transform/opacity, sem canvas nem blur animado; para com a página oculta e some com movimento reduzido.
 */
export function SkyBackdrop({ mood }: { mood: SkyMood }) {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  const raining = mood === 'rain' || mood === 'storm';
  return (
    <div className="sky" aria-hidden="true" {...(hidden ? { 'data-paused': '' } : {})}>
      {raining && (
        <>
          <div className="rain-layer" data-depth="far" style={{ backgroundImage: FAR, backgroundSize: '320px 480px' }} />
          <div className="rain-layer" data-depth="near" style={{ backgroundImage: NEAR, backgroundSize: '320px 480px' }} />
        </>
      )}
      {mood === 'storm' && <div className="lightning" />}
    </div>
  );
}
