const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const layer=require('../dist/modules/weather-data-layer.js');
const {forecast,city}=require('./support/forecast.cjs');

test('topo lê o snapshot normalizado com nomes do PLUVIA',()=>{
  const data=forecast();data.hourly.uv_index[5]=9;data.hourly.visibility[5]=2500;data.hourly.cape=Array(72).fill(1800);
  const snapshot=layer.normalizeOpenMeteo(data,null,city);
  const now=layer.heroReading(snapshot,data,5);
  assert.deepEqual(JSON.parse(JSON.stringify(now)),{time:data.current.time,temperature:30,apparentTemperature:34,relativeHumidity:70,windSpeed:12,windDirection:90,windGust:20,pressure:1010,uvIndex:9,visibility:2500});
  assert.equal(snapshot.hourly[5].cape,1800);
});

test('sem snapshot, a mesma leitura sai do JSON cru; ausente vira null, nunca zero',()=>{
  const data=forecast();delete data.current.pressure_msl;data.current.surface_pressure=1004;data.current.wind_gusts_10m=null;data.hourly.uv_index[2]='7';
  const now=layer.heroReading(null,data,2);
  assert.equal(now.pressure,1004);assert.equal(now.windGust,null);assert.equal(now.uvIndex,null);assert.equal(now.visibility,10000);
  assert.equal(layer.heroReading(null,{},-1).temperature,null);
});

test('render do app usa a leitura normalizada no topo e nos blocos',()=>{
  const app=fs.readFileSync('dist/app.js','utf8');
  const body=app.slice(app.indexOf('function render(data, air'),app.indexOf('async function loadWeather'));
  assert.match(body,/heroReading\?\.\(snapshot, data, start\)/);
  for(const field of ['temperature_2m)','relative_humidity_2m)','wind_speed_10m)','wind_gusts_10m)']) assert.ok(!body.includes(`fmt(current.${field}`),field);
});
