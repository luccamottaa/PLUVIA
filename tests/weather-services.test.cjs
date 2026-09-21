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

  const air = new URL(services.airQuality.currentUrl(manaus));
  assert.equal(air.hostname, 'air-quality-api.open-meteo.com');
  assert.match(air.searchParams.get('current'), /pm2_5/);
  assert.match(air.searchParams.get('current'), /us_aqi/);
  assert.throws(() => services.weather.forecastUrl({lat:999,lon:0,timezone:'UTC'}), /Localização/);
});

test('grade de precipitação contém nove pontos e preserva o timezone', () => {
  const services = createServices({client:{getJson(){}}});
  const url = new URL(services.weather.precipitationGridUrl(manaus));
  assert.equal(url.searchParams.get('latitude').split(',').length, 9);
  assert.equal(url.searchParams.get('longitude').split(',').length, 9);
  assert.equal(url.searchParams.get('timezone'), 'America/Manaus');
  assert.equal(url.searchParams.get('forecast_hours'), '8');
});

test('serviços delegam transporte e timeout ao cliente HTTP compartilhado', async () => {
  const calls = [];
  let aborted = false;
  const payload = {ok:true};
  const services = createServices({client:{getJson:async (url,options) => {calls.push({url,options}); return payload;},abortAll:()=>{aborted=true;}}});
  assert.equal(await services.weather.getForecast(manaus), payload);
  assert.equal(await services.airQuality.getCurrent(manaus), payload);
  assert.equal(await services.alerts.getActive(), payload);
  assert.equal(await services.civilDefense.getManausRecent(), payload);
  assert.equal(await services.weather.getPrecipitationGrid(manaus), payload);
  assert.equal(calls.length, 5);
  assert(calls.every(call => call.options.timeoutMs > 0));
  assert.equal(calls.at(-1).options.timeoutMs, 10000);
  services.abortAll();
  assert.equal(aborted, true);
});
