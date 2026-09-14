const assert = require('node:assert/strict');
const insights = require('../dist/modules/weather-insights.js');

function fixture() {
  const time = [];
  const temperature = [];
  const apparent = [];
  const probability = [];
  const precipitation = [];
  const uv = [];
  const start = new Date('2026-09-13T10:00:00Z');
  for (let index = 0; index < 48; index += 1) {
    time.push(new Date(start.getTime() + index * 3600000).toISOString().slice(0, 16));
    temperature.push(index < 24 ? 28 : 30);
    apparent.push(index < 24 ? 30 : 35);
    probability.push(index >= 28 && index <= 31 ? 80 : 10);
    precipitation.push(index === 29 ? 3 : index === 30 ? 8 : 0);
    uv.push(index === 26 ? 8 : index === 27 ? 11 : 1);
  }
  return {
    current:{time:time[24],temperature_2m:30,apparent_temperature:35,relative_humidity_2m:78,wind_speed_10m:8},
    hourly:{time,temperature_2m:temperature,apparent_temperature:apparent,precipitation_probability:probability,precipitation,uv_index:uv}
  };
}

{
  const data = fixture();
  const result = insights.yesterday(data.hourly, 24);
  assert.equal(result.delta, 2);
  assert.match(result.text, /2 °C mais quente/);
}
{
  const data = fixture();
  assert.match(insights.feelsLike(data.current).label, /Elevada/);
  const result = insights.uv(data.hourly, 24);
  assert.equal(result.peak, 11);
  assert.equal(result.time, '13:00');
}
{
  const data = fixture();
  const result = insights.rain(data.hourly, 24);
  assert.equal(result.chance, 80);
  assert.equal(result.volume, 11);
  assert.equal(result.intensity, 'forte');
  assert.equal(result.window, '14:00–17:00');
}
{
  const result = insights.build({forecast:{current:{},hourly:{time:[]}}});
  assert.equal(result.comparison, '');
  assert.equal(result.rain, null);
  assert.deepEqual(result.highlights, []);
  assert.equal(insights.feelsLike({temperature_2m:null,apparent_temperature:null}), null);
}

console.log('PASS weather insights: ontem, sensação, UV, chuva e ausência de dados.');
