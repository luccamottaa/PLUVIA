const cache = new Map<string, Intl.DateTimeFormat>();
function dateFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let f = cache.get(key);
  if (!f) {
    if (cache.size > 20) cache.clear();
    f = new Intl.DateTimeFormat('pt-BR', options);
    cache.set(key, f);
  }
  return f;
}

export const temp = (value: number | null) => (value === null ? '--' : `${Math.round(value)}`);

/** Datas diárias são calendários ancorados em UTC. */
export function weekday(date: Date, index: number, short = false): string {
  if (index === 0) return 'Hoje';
  const name = dateFormat({ weekday: short ? 'short' : 'long', timeZone: 'UTC' }).format(date).replace('.', '');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function hourLabel(at: Date, timeZone: string): string {
  return dateFormat({ hour: '2-digit', timeZone }).format(at).replace(/\D/g, '');
}
