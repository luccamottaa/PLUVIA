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
  assert.equal(result.tone, 'warmer');
  assert.equal(result.text, '2° mais quente que ontem neste horário.');
}
{
  // Margem de 1 °C entre modelos: diferença pequena vira "parecida"; ausência de ontem não vira comparação.
  const data = fixture();
  data.hourly.temperature_2m[0] = data.hourly.temperature_2m[24] - 0.6;
  assert.equal(insights.yesterday(data.hourly, 24).tone, 'same');
  data.hourly.temperature_2m[0] = data.hourly.temperature_2m[24] + 3.4;
  assert.equal(insights.yesterday(data.hourly, 24).text, '3° mais fresco que ontem neste horário.');
  data.hourly.temperature_2m[0] = null;
  assert.equal(insights.yesterday(data.hourly, 24), null);
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
  assert.equal(result.window, '13:00–17:00');
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

{
  // Umidade: faixas da Defesa Civil, ausência explícita e hora mais seca restante no dia municipal.
  assert.equal(insights.humidityLevel(11.9).level, 'emergency');
  assert.equal(insights.humidityLevel(12).level, 'alert');
  assert.equal(insights.humidityLevel(19).level, 'alert');
  assert.equal(insights.humidityLevel(25).level, 'attention');
  assert.equal(insights.humidityLevel(45).label, 'Ar mais seco');
  assert.equal(insights.humidityLevel(60).label, 'Faixa confortável');
  assert.equal(insights.humidityLevel(90).label, 'Umidade muito alta');
  for (const missing of [null, undefined, '20', NaN, -1, 101]) assert.equal(insights.humidityLevel(missing), null);

  const time = [], rh = [];
  for (let hour = 0; hour < 30; hour += 1) {
    const dayPart = hour < 24 ? '2026-10-06' : '2026-10-07';
    time.push(`${dayPart}T${String(hour % 24).padStart(2, '0')}:00`);
    rh.push(hour === 15 ? 17 : hour === 26 ? 9 : 45);
  }
  const morning = insights.humidity({time, relative_humidity_2m:rh}, 9, {relative_humidity_2m:44.6});
  assert.equal(morning.level, 'dry');
  assert.deepEqual(morning.driest, {value:17, time:'15:00', index:15});
  assert.equal(morning.note, 'Ar mais seco · chega a 17% às 15h');

  // A madrugada seguinte (9%) pertence a outro dia municipal e não entra na leitura de hoje.
  const evening = insights.humidity({time, relative_humidity_2m:rh}, 18, {relative_humidity_2m:45});
  assert.equal(evening.driest.value, 45);
  assert.equal(evening.note, 'Ar mais seco');

  // A hora atual já é a mais seca: não repetir a mesma leitura como previsão.
  const now = insights.humidity({time, relative_humidity_2m:rh}, 15, {relative_humidity_2m:17});
  assert.equal(now.note, 'Alerta: ar muito seco');

  // Lacunas no horário não viram 0% (que seria uma emergência inventada).
  const gaps = insights.humidity({time, relative_humidity_2m:rh.map((value, index) => index === 12 ? null : value)}, 9, {relative_humidity_2m:null});
  assert.equal(gaps.now, null);
  assert.equal(gaps.label, 'Umidade indisponível');
  assert.equal(gaps.driest.value, 17);
}

{
  // PM2,5 24h: diretriz OMS 2021 e metas intermediárias; ausência não vira ar limpo.
  assert.equal(insights.particles(null), null);
  assert.equal(insights.particles({value:null, samples:24}), null);
  assert.equal(insights.particles({value:15, samples:24}).level, 'guideline');
  assert.equal(insights.particles({value:15.1, samples:24}).level, 'above-guideline');
  assert.equal(insights.particles({value:25, samples:24}).notable, false);
  const smoke = insights.particles({value:62.4, samples:20});
  assert.equal(smoke.level, 'high');
  assert.equal(smoke.notable, true);
  assert.doesNotMatch(smoke.label, /fumaça|queimada|incêndio/i, 'a leitura descreve concentração, sem atribuir origem');
}
