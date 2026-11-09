// Modo de teste "Testar Tomorrow.io" (pedido do dono, novembro/2026): funções puras da função
// tomorrow-forecast, sem imports, para os testes carregarem num VM. Converte a resposta Timelines do
// Tomorrow.io (timesteps current e 1h, unidades métricas) em leituras no vocabulário do PLUVIA; o
// navegador encaixa essas leituras na previsão do Open-Meteo (modules/tomorrow-test.js).
//
// Ausente continua ausente: valor fora da faixa, string ou null vira null, nunca zero.

export const TEST_FIELDS = [
  'temperature', 'temperatureApparent', 'humidity', 'windSpeed', 'windGust', 'windDirection', 'pressureSeaLevel',
  'uvIndex', 'visibility', 'cloudCover', 'precipitationProbability', 'rainAccumulation', 'precipitationIntensity', 'weatherCode',
];
export const TEST_HOURS = 48;

// Código do Tomorrow.io → WMO (o vocabulário dos ícones e textos do app). Desconhecido vira null e o app
// conserva o código do Open-Meteo daquela hora.
export const WMO = {
  1000: 0, 1100: 1, 1101: 2, 1102: 3, 1001: 3,
  2000: 45, 2100: 45,
  4000: 53, 4200: 61, 4001: 63, 4201: 65,
  5000: 73, 5001: 71, 5100: 71, 5101: 75,
  6000: 56, 6200: 66, 6001: 67, 6201: 67,
  7000: 77, 7101: 77, 7102: 77,
  8000: 95,
};

const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
const kmh = value => { const ms = finite(value, 0, 120); return ms === null ? null : Math.round(ms * 36) / 10; };

export function reading(values) {
  const v = values && typeof values === 'object' ? values : {};
  const code = Object.prototype.hasOwnProperty.call(WMO, v.weatherCode) ? WMO[v.weatherCode] : null;
  return {
    temperatureC: finite(v.temperature, -40, 60),
    apparentC: finite(v.temperatureApparent, -60, 75),
    humidity: finite(v.humidity, 0, 100),
    windKmh: kmh(v.windSpeed),
    gustKmh: kmh(v.windGust),
    windDirection: finite(v.windDirection, 0, 360),
    pressureHpa: finite(v.pressureSeaLevel, 850, 1100),
    uvIndex: finite(v.uvIndex, 0, 20),
    visibilityKm: finite(v.visibility, 0, 100),
    cloudCover: finite(v.cloudCover, 0, 100),
    probability: finite(v.precipitationProbability, 0, 100),
    rainMm: finite(v.rainAccumulation, 0, 300) ?? finite(v.precipitationIntensity, 0, 300),
    code,
  };
}

function timeline(json, step) {
  const list = Array.isArray(json?.data?.timelines) ? json.data.timelines : [];
  return list.find(item => item?.timestep === step) || null;
}

// { current, hourly } ou null quando não há nenhuma hora com temperatura. `time` é o instante UTC do início
// do intervalo (o navegador alinha chuva e chance à hora que termina, como no Open-Meteo).
export function normalizeTomorrow(json, now = Date.now()) {
  const hourly = (timeline(json, '1h')?.intervals || []).map(item => {
    const at = Date.parse(item?.startTime);
    return Number.isFinite(at) ? { time: new Date(at).toISOString(), ...reading(item.values) } : null;
  }).filter(item => item && Date.parse(item.time) >= now - 2 * 3600_000 && Date.parse(item.time) <= now + (TEST_HOURS + 1) * 3600_000)
    .slice(0, TEST_HOURS + 2);
  if (!hourly.some(item => item.temperatureC !== null)) return null;
  const first = timeline(json, 'current')?.intervals?.[0];
  const at = Date.parse(first?.startTime);
  const current = Number.isFinite(at) && Math.abs(now - at) <= 90 * 60_000 ? { time: new Date(at).toISOString(), ...reading(first.values) } : null;
  return { source: 'Tomorrow.io', current: current && current.temperatureC !== null ? current : null, hourly };
}
