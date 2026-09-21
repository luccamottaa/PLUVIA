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

{
  const labels = insights.uniqueHighlights(
    ['Baixa chance de chuva', '0,9 °C mais quente', 'BAIXA CHANCE DE CHUVA'],
    ['Baixa chance de chuva'],
    3
  );
  assert.deepEqual(labels, ['0,9 °C mais quente']);
  assert.deepEqual(insights.uniqueHighlights(['A', 'A', 'B', 'C'], [], 2), ['A', 'B']);
}

// A lacuna deve omitir a recomendação, não afirmar que o tempo está seco.
for (const value of [null, undefined, '', ' ', false, [], NaN, Infinity, -1]) {
  for (const field of ['precipitation', 'precipitation_probability']) {
    const data = fixture();
    data.hourly[field][28] = value;
    const result = insights.build({forecast:data, start:24});
    assert.equal(result.rain, null);
    assert.ok(!result.highlights.some(text => /chuva/i.test(text)));
    assert.ok(!result.reasons.some(text => /chance|mm/.test(text)));
  }
}
{
  const data = fixture();
  data.hourly.precipitation_probability.fill(0);
  data.hourly.precipitation.fill(0);
  assert.equal(insights.rain(data.hourly, 24).volume, 0);
  assert.equal(insights.rain(data.hourly, 24).chance, 0);
  assert.ok(insights.build({forecast:data, start:24}).highlights.includes('Baixa chance de chuva'));
  assert.equal(insights.rain(data.hourly, 40), null);
  data.hourly.precipitation_probability[28] = 101;
  assert.equal(insights.rain(data.hourly, 24), null);
  data.hourly.precipitation_probability[28] = 45;
  const result = insights.build({forecast:data, start:24});
  assert.ok(result.highlights.includes('Possibilidade de chuva: 45%'));
  assert.ok(!result.highlights.includes('Baixa chance de chuva'));
}
