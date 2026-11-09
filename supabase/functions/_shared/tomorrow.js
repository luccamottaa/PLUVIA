// Tomorrow.io como segunda opinião nos avisos de chuva (pedido do dono, novembro/2026). Só o servidor consulta,
// só quando um aviso de chuva (rain_approaching/heavy_rain) vai sair, e o resultado entra na mesma conta de
// concordância dos modelos do Open-Meteo. Nada aparece na tela do app.
//
// Plano grátis: 25 consultas por hora e 500 por dia (o dia vira 00:00 UTC); passar disso devolve 429. Não há
// contador global aqui (exigiria migration): cada instância guarda a leitura por 30 min por coordenada, faz no
// máximo MAX_PER_RUN consultas por rodada do push-process (a cada 5 min = 24 por hora no pior caso) e, depois
// de um 429, fica 30 min sem tentar. Sem a secret TOMORROW_API_KEY nada é consultado. Falha nunca segura o
// aviso nem vira "não vai chover": só tira o Tomorrow.io da conta.
//
// Endpoint Timelines (pedido do dono, novembro/2026): pede só os dois campos de chuva, só a hora e só as
// próximas HORIZON_H horas, em vez da previsão completa de 5 dias do /v4/weather/forecast (mesma cota por
// chamada, resposta bem menor). startTime vai no começo da hora UTC atual: com "now" os intervalos podem
// começar no minuto da consulta e não casariam com as horas cheias do Open-Meteo.
//
// A chave vai na URL (é como a API aceita): nunca registrar a URL em log.
export const TOMORROW_ENDPOINT = 'https://api.tomorrow.io/v4/timelines';
export const TOMORROW_FIELDS = ['rainAccumulation', 'precipitationIntensity'];
export const HORIZON_H = 48;
export const MAX_PER_RUN = 2;
export const CACHE_MS = 30 * 60_000;
export const COOLDOWN_MS = 30 * 60_000;
const TIMEOUT_MS = 5000;
const MAX_CACHE = 64;

export function tomorrowUrl(lat, lon, key, now = Date.now()) {
  const start = Math.floor(now / 3_600_000) * 3_600_000;
  const url = new URL(TOMORROW_ENDPOINT);
  url.search = new URLSearchParams({
    location: `${lat.toFixed(3)},${lon.toFixed(3)}`, fields: TOMORROW_FIELDS.join(','), timesteps: '1h', units: 'metric',
    startTime: new Date(start).toISOString(), endTime: new Date(start + HORIZON_H * 3_600_000).toISOString(), timezone: 'UTC', apikey: key,
  }).toString();
  return url.toString();
}

// Pontos horários { at (ms), values } da resposta. Timelines: data.timelines[] com timestep "1h" e
// intervals[].startTime. O formato do /v4/weather/forecast (timelines.hourly[].time) continua aceito.
function hourlyPoints(json) {
  const timelines = Array.isArray(json?.data?.timelines) ? json.data.timelines : [];
  const hourly = timelines.find(timeline => timeline?.timestep === '1h');
  if (hourly) return (Array.isArray(hourly.intervals) ? hourly.intervals : []).map(item => ({ at: Date.parse(item?.startTime), values: item?.values }));
  const legacy = Array.isArray(json?.timelines?.hourly) ? json.timelines.hourly : [];
  return legacy.map(item => ({ at: Date.parse(item?.time), values: item?.values }));
}

const finite = (value, max = 500) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max ? value : null);

// Chuva prevista por hora alinhada ao contrato do Open-Meteo: lá o valor em `time` é o intervalo que TERMINA
// nesse horário. No Tomorrow.io o ponto horário (startTime) descreve a hora que COMEÇA nele, então a hora que
// termina em T vem do ponto T − 1 h. Usa a chuva acumulada na hora (rainAccumulation, mm) e, sem ela, a
// intensidade de precipitação (mm/h, que numa hora é o mesmo número). Hora sem ponto válido fica null.
export function rainSeries(json, times) {
  const byHour = new Map();
  for (const point of hourlyPoints(json)) {
    const at = point.at;
    if (!Number.isFinite(at)) continue;
    const values = point?.values ?? {};
    const mm = finite(values.rainAccumulation) ?? finite(values.precipitationIntensity);
    if (mm !== null) byHour.set(Math.round(at / 1000), mm);
  }
  if (!byHour.size) return null;
  const series = (Array.isArray(times) ? times : []).map(time => {
    const end = typeof time === 'number' ? time : Number(time);
    return Number.isFinite(end) && byHour.has(end - 3600) ? byHour.get(end - 3600) : null;
  });
  return series.some(value => value !== null) ? series : null;
}

// Cliente com cache e freio por instância. `fetchImpl`/`now` injetáveis para os testes.
/** @param {{ key?: string, fetchImpl?: typeof fetch, now?: () => number }} [options] */
export function createTomorrowClient({ key = '', fetchImpl = fetch, now = () => Date.now() } = {}) {
  const cache = new Map();
  let blockedUntil = 0;
  let used = 0;
  return {
    enabled: Boolean(key),
    startRun() { used = 0; },
    async forecast(lat, lon) {
      if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const id = `${lat.toFixed(2)},${lon.toFixed(2)}`;
      const hit = cache.get(id);
      if (hit && now() - hit.at < CACHE_MS) return hit.json;
      if (now() < blockedUntil || used >= MAX_PER_RUN) return null;
      used++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetchImpl(tomorrowUrl(lat, lon, key, now()), { signal: controller.signal, headers: { accept: 'application/json' } });
        if (response.status === 429) { blockedUntil = now() + COOLDOWN_MS; return null; }
        // Só o status (nunca a URL, que leva a chave): um 400 por campo/parâmetro recusado não pode passar calado.
        if (!response.ok) { console.warn('tomorrow unavailable', { status: response.status }); return null; }
        const json = await response.json();
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
        cache.set(id, { at: now(), json });
        return json;
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
