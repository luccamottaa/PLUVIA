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
// 1.73.4 (pedido do dono: os 7 dias também do Tomorrow.io): 120 horas, o limite do plano grátis (+5 dias), no
// mesmo pedido. O navegador monta os dias a partir dessas horas (máxima, mínima, chuva, chance, UV, condição); os
// campos diários do Tomorrow.io (temperatureMax…) não entram: um nome que o Timelines não aceite derrubaria o pedido.
export const TEST_HOURS = 120;
// Campos que o PLUVIA não tinha (1.73.4, pedido do dono: "tudo o que o Tomorrow entregue tenha no PLUVIA"). Vão no
// mesmo pedido; se o provedor recusar algum (400), a função repete só com TEST_FIELDS e não pede mais os extras.
// Qualidade do ar (1.73.6, pedido do dono: "o Tomorrow fornece qualidade do ar? se fornecer bota"). A documentação
// lista os campos mas não diz se o plano grátis os inclui: vão num nível próprio, e a função tira só eles se o
// provedor recusar (400/403), antes de tirar os extras.
export const AIR_FIELDS = ['epaIndex', 'epaPrimaryPollutant', 'particulateMatter25', 'particulateMatter10', 'pollutantO3', 'pollutantNO2', 'pollutantSO2'];
export const EXTRA_FIELDS = ['dewPoint', 'cloudBase', 'cloudCeiling', 'pressureSurfaceLevel', 'precipitationType', 'rainIntensity', 'evapotranspiration', 'uvHealthConcern'];

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
    dewPointC: finite(v.dewPoint, -60, 40),
    cloudBaseKm: finite(v.cloudBase, 0, 30),
    cloudCeilingKm: finite(v.cloudCeiling, 0, 30),
    surfacePressureHpa: finite(v.pressureSurfaceLevel, 500, 1100),
    precipitationType: [0, 1, 2, 3, 4].includes(v.precipitationType) ? v.precipitationType : null,
    rainIntensityMmH: finite(v.rainIntensity, 0, 300),
    evapotranspirationMm: finite(v.evapotranspiration, 0, 30),
    uvConcern: [0, 1, 2, 3, 4].includes(v.uvHealthConcern) ? v.uvHealthConcern : null,
    aqi: finite(v.epaIndex, 0, 500),
    aqiPollutant: [0, 1, 2, 3, 4, 5].includes(v.epaPrimaryPollutant) ? v.epaPrimaryPollutant : null,
    pm25: finite(v.particulateMatter25, 0, 2000),
    pm10: finite(v.particulateMatter10, 0, 3000),
    o3Ppb: finite(v.pollutantO3, 0, 1000),
    no2Ppb: finite(v.pollutantNO2, 0, 1000),
    so2Ppb: finite(v.pollutantSO2, 0, 1000),
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
