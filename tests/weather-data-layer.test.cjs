const test = require('node:test');
const assert = require('node:assert/strict');
const layer = require('../dist/modules/weather-data-layer.js');

const forecast = {
  current: { time:'2026-09-14T10:00', temperature_2m:31, apparent_temperature:36, relative_humidity_2m:78, precipitation:0, weather_code:2, is_day:1, wind_speed_10m:12, wind_gusts_10m:25, pressure_msl:1009 },
  hourly: { time:['2026-09-14T10:00'], temperature_2m:[31], apparent_temperature:[36], relative_humidity_2m:[78], precipitation_probability:[45], precipitation:[0.4], weather_code:[2], visibility:[10000], wind_speed_10m:[12], wind_gusts_10m:[25], pressure_msl:[1009], uv_index:[8] },
  daily: { time:['2026-09-14'], weather_code:[80], temperature_2m_max:[34], temperature_2m_min:[25], precipitation_sum:[5], precipitation_probability_max:[70], uv_index_max:[11], sunrise:['2026-09-14T05:50'], sunset:['2026-09-14T17:58'] }
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
