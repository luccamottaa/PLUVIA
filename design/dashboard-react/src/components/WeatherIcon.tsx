import type { WmoCode } from '../types';

type Glyph = 'sun' | 'moon' | 'partly-day' | 'partly-night' | 'cloud' | 'rain' | 'storm' | 'fog' | 'snow';

export function glyphFor(code: WmoCode | null, isDay: boolean): Glyph {
  if (code === null) return 'cloud';
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 51) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code === 3) return 'cloud';
  if (code === 1 || code === 2) return isDay ? 'partly-day' : 'partly-night';
  return isDay ? 'sun' : 'moon';
}

const CLOUD = 'M7 18h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 9.2 4.4 4.4 0 0 0 7 18Z';

/** Ícones em traço, grade de 24 px, `currentColor`: minimalistas e legíveis em qualquer céu. */
export function WeatherIcon({ code, isDay, size = 28, className = '' }: { code: WmoCode | null; isDay: boolean; size?: number; className?: string }) {
  const glyph = glyphFor(code, isDay);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {glyph === 'sun' && (<><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>)}
      {glyph === 'moon' && <path d="M19.5 14.6A7.5 7.5 0 0 1 9.4 4.5a7.5 7.5 0 1 0 10.1 10.1Z" />}
      {glyph === 'partly-day' && (<><path d="M8.5 6.2a3.6 3.6 0 0 1 5.6 2.4M8.5 2.5v1.2M3.8 8.4H5M4.9 4.8l.9.9" /><path d={CLOUD} transform="translate(1 1)" /></>)}
      {glyph === 'partly-night' && (<><path d="M12.6 6.9A4.3 4.3 0 0 1 7 3a4.3 4.3 0 1 0 1.7 6.3" /><path d={CLOUD} transform="translate(1 1)" /></>)}
      {glyph === 'cloud' && <path d={CLOUD} />}
      {glyph === 'rain' && (<><path d={CLOUD} transform="translate(0 -3)" /><path d="M8.5 18.5 7.6 21M12.5 18.5l-.9 2.5M16.5 18.5l-.9 2.5" /></>)}
      {glyph === 'storm' && (<><path d={CLOUD} transform="translate(0 -3)" /><path d="m12.8 15.6-2.3 3.4h3l-2.2 3.4" /></>)}
      {glyph === 'fog' && (<><path d={CLOUD} transform="translate(0 -4)" /><path d="M4 17.5h16M6 20.5h12" /></>)}
      {glyph === 'snow' && (<><path d={CLOUD} transform="translate(0 -3)" /><path d="M8 19h.01M12 21h.01M16 19h.01M10 21.5h.01M14 18h.01" strokeWidth={2.4} /></>)}
    </svg>
  );
}
