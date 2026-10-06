const test = require('node:test');
const assert = require('node:assert/strict');
const {createServices} = require('../dist/modules/weather-services.js');

const manaus = {id:'1302603',name:'Manaus',lat:-3.119,lon:-60.021,timezone:'America/Manaus'};

test('constrói URLs meteorológicas somente a partir da localização normalizada', () => {
  const services = createServices({client:{getJson(){}}});
  const forecast = new URL(services.weather.forecastUrl(manaus));
  assert.equal(forecast.hostname, 'api.open-meteo.com');
  assert.equal(forecast.searchParams.get('latitude'), '-3.119');
  assert.equal(forecast.searchParams.get('longitude'), '-60.021');
  assert.equal(forecast.searchParams.get('timezone'), 'America/Manaus');
  assert.equal(forecast.searchParams.get('past_hours'), '24');
  assert.equal(forecast.searchParams.get('forecast_days'), '8');
  assert.match(forecast.searchParams.get('hourly'), /wind_direction_10m/);
  assert.match(forecast.searchParams.get('daily'), /sunshine_duration/);
  assert.match(forecast.searchParams.get('daily'), /daylight_duration/);

  const air = new URL(services.airQuality.currentUrl(manaus));
  assert.equal(air.hostname, 'air-quality-api.open-meteo.com');
  assert.match(air.searchParams.get('current'), /pm2_5/);
  assert.equal(air.searchParams.get('hourly'), 'pm2_5');
  assert.equal(air.searchParams.get('past_hours'), '24');
  assert.equal(air.searchParams.get('forecast_hours'), '1');
  assert.equal(air.searchParams.has('forecast_days'), false);
  assert.match(air.searchParams.get('current'), /us_aqi/);
  const spread = new URL(services.ensemble.dailyUrl(manaus));
  assert.equal(spread.hostname, 'ensemble-api.open-meteo.com');
  assert.equal(spread.searchParams.get('daily'), 'temperature_2m_max,temperature_2m_min');
  assert.equal(spread.searchParams.get('models'), 'icon_seamless_eps');
  assert.equal(spread.searchParams.get('timezone'), 'America/Manaus');
  assert.equal(spread.searchParams.has('hourly'), false);
  assert.throws(() => services.weather.forecastUrl({lat:999,lon:0,timezone:'UTC'}), /Localização/);
});

test('serviços delegam transporte e timeout ao cliente HTTP compartilhado', async () => {
  const calls = [];
  let aborted = false;
  const payload = {ok:true};
  const services = createServices({client:{getJson:async (url,options) => {calls.push({url,options}); return payload;},abortAll:()=>{aborted=true;}}});
  assert.equal(await services.weather.getForecast(manaus), payload);
  assert.equal(await services.ensemble.getForecast(manaus), payload);
  assert.equal(await services.airQuality.getCurrent(manaus), payload);
  assert.equal(await services.alerts.getActive(), payload);
  assert.equal(calls.length, 4);
  assert(calls.every(call => call.options.timeoutMs > 0));
  services.abortAll();
  assert.equal(aborted, true);
});
