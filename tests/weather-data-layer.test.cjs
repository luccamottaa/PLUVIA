const test = require('node:test');
const assert = require('node:assert/strict');
const layer = require('../dist/modules/weather-data-layer.js');

const hourlyTimes = ['2026-09-14T09:00', '2026-09-14T10:00', '2026-09-14T11:00'];
const repeat = value => [value, value, value];
const forecast = {
  current: { time:'2026-09-14T10:00', temperature_2m:31, apparent_temperature:36, relative_humidity_2m:78, precipitation:0, rain:0, showers:0, weather_code:2, cloud_cover:42, is_day:1, wind_speed_10m:12, wind_direction_10m:90, wind_gusts_10m:25, pressure_msl:1009 },
  hourly: { time:hourlyTimes, temperature_2m:repeat(31), apparent_temperature:repeat(36), relative_humidity_2m:repeat(78), precipitation_probability:repeat(45), precipitation:repeat(0.4), rain:repeat(0.4), weather_code:repeat(2), cloud_cover:repeat(42), visibility:repeat(10000), wind_speed_10m:repeat(12), wind_gusts_10m:repeat(25), pressure_msl:repeat(1009), uv_index:repeat(8) },
  daily: { time:['2026-09-14'], weather_code:[80], temperature_2m_max:[34], temperature_2m_min:[25], apparent_temperature_max:[39], apparent_temperature_min:[28], precipitation_sum:[5], rain_sum:[5], precipitation_probability_max:[70], uv_index_max:[11], sunrise:['2026-09-14T05:50'], sunset:['2026-09-14T17:58'] }
};
const air = { current:{ time:'2026-09-14T10:00', us_aqi:32, pm2_5:8, pm10:15, ozone:44 } };
const city = { id:'1302603', name:'Manaus', uf:'AM', timezone:'America/Manaus', lat:-3.119, lon:-60.022 };

test('normaliza Open-Meteo para o contrato interno do PLUVIA', () => {
  const snapshot = layer.normalizeOpenMeteo(forecast, air, city, {checkedAt:123});
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.location.name, 'Manaus');
  assert.equal(snapshot.current.temperature, 31);
  assert.equal(snapshot.current.apparentTemperature, 36);
  assert.equal(snapshot.hourly[0].precipitationProbability, 45);
  assert.equal(snapshot.daily[0].temperatureMax, 34);
  assert.equal(snapshot.airQuality.aqiUs, 32);
  assert.equal(snapshot.source.weather, 'open-meteo');
  assert.equal(snapshot.source.kind, 'model');
  assert.equal(snapshot.units.windSpeed, 'kilometer-per-hour');
});

test('mantém snapshots isolados por localização', () => {
  const snapshot = layer.ingestOpenMeteo(forecast, air, city);
  assert.equal(layer.get(city.id), snapshot);
  assert.equal(layer.get('outra-cidade'), null);
  layer.clear(city.id);
  assert.equal(layer.get(city.id), null);
});

test('rejeita payload incompleto em vez de inventar dados', () => {
  assert.throws(() => layer.normalizeOpenMeteo({current:{}}, null, city), /incompleta/);
});

test('contrato rejeita ausência e tipos inválidos em vez de convertê-los em zero', () => {
  for (const value of [null, undefined, '', ' ', '0', false, true, [], {}, NaN, Infinity]) {
    const input = structuredClone(forecast);
    input.current.temperature_2m = value;
    assert.equal(layer.validateForecast(input).valid, false);
    assert.throws(() => layer.normalizeOpenMeteo(input, null, city), /incompleta/);
  }
});

test('contrato rejeita séries desalinhadas e valores meteorológicos fora da faixa', () => {
  const misaligned = structuredClone(forecast);
  misaligned.hourly.precipitation_probability.pop();
  const invalidRange = structuredClone(forecast);
  invalidRange.daily.precipitation_probability_max[0] = 120;
  assert.equal(layer.validateForecast(misaligned).valid, false);
  assert.match(layer.validateForecast(misaligned).errors.join(' '), /desalinhado/);
  assert.equal(layer.validateForecast(invalidRange).valid, false);
  assert.match(layer.validateForecast(invalidRange).errors.join(' '), /fora da faixa/);
});

test('aceita ausência declarada fora do horizonte exibido, mas não dentro dele', () => {
  const input = structuredClone(forecast);
  input.current.rain = null;
  input.current.showers = null;
  input.current.cloud_cover = null;
  const hourlyFields = Object.keys(input.hourly).filter(field => field !== 'time');
  for (let offset = 1; offset <= 40; offset++) {
    input.hourly.time.push(new Date(Date.UTC(2026, 8, 14, 11 + offset)).toISOString().slice(0, 16));
    for (const field of hourlyFields) input.hourly[field].push(input.hourly[field][input.hourly[field].length - 1]);
  }
  for (const field of hourlyFields) input.hourly[field][input.hourly[field].length - 1] = null;

  const dailyFields = Object.keys(input.daily).filter(field => !['time', 'sunrise', 'sunset'].includes(field));
  for (let offset = 1; offset <= 7; offset++) {
    const day = String(14 + offset).padStart(2, '0');
    input.daily.time.push(`2026-09-${day}`);
    input.daily.sunrise.push(`2026-09-${day}T05:50`);
    input.daily.sunset.push(`2026-09-${day}T17:58`);
    for (const field of dailyFields) input.daily[field].push(input.daily[field][input.daily[field].length - 1]);
  }
  for (const field of dailyFields) input.daily[field][7] = null;
  input.daily.sunrise[7] = null;
  input.daily.sunset[7] = null;

  assert.equal(layer.validateForecast(input).valid, true);
  const optionalGap = structuredClone(input);
  optionalGap.hourly.visibility[2] = null;
  optionalGap.daily.rain_sum[0] = null;
  assert.equal(layer.validateForecast(optionalGap).valid, true);
  const visibleGap = structuredClone(input);
  visibleGap.hourly.precipitation[2] = null;
  assert.equal(layer.validateForecast(visibleGap).valid, false);
});

test('qualidade do ar inválida é descartada sem contaminar a previsão', () => {
  assert.equal(layer.validateAirQuality(air).valid, true);
  assert.equal(layer.validateAirQuality({current:{time:'inválido', us_aqi:'32'}}).valid, false);
  const snapshot = layer.normalizeOpenMeteo(forecast, {current:{time:'inválido', us_aqi:'32'}}, city);
  assert.equal(snapshot.airQuality, null);
  assert.equal(snapshot.current.temperature, 31);
});

test('zero medido e noite são preservados', () => {
  const input = structuredClone(forecast);
  input.current.temperature_2m = 0;
  input.current.weather_code = 0;
  input.current.is_day = 0;
  const snapshot = layer.normalizeOpenMeteo(input, {current:{time:'2026-09-14T10:00', us_aqi:0, pm2_5:0}}, city);
  assert.equal(snapshot.current.temperature, 0);
  assert.equal(snapshot.current.weatherCode, 0);
  assert.equal(snapshot.current.isDay, false);
  assert.equal(snapshot.airQuality.aqiUs, 0);
  assert.equal(snapshot.airQuality.pm25, 0);
});
