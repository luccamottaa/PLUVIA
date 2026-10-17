const {test} = require('node:test');
const assert = require('node:assert/strict');
const insights = require('../dist/modules/weather-insights.js');

function makeSeries(hours, {mm = () => 0, chance = () => 5, code = () => 3} = {}) {
  const time = [], precipitation = [], precipitation_probability = [], weather_code = [];
  for (let i = 0; i < hours; i++) {
    time.push(`2026-10-16T${String(14 + i).padStart(2, '0')}:00`);
    precipitation.push(i === 0 ? 0 : mm(i - 1));
    precipitation_probability.push(i === 0 ? 0 : chance(i - 1));
    weather_code.push(i === 0 ? 3 : code(i - 1));
  }
  return {time, precipitation, precipitation_probability, weather_code};
}

test('rainGauge: dia seco sem chuva retorna nível dry e inativo', () => {
  const hourly = makeSeries(12);
  const gauge = insights.rainGauge(hourly, 0, {current: {weather_code: 3}});
  assert.equal(gauge.level, 'dry');
  assert.equal(gauge.active, false);
  assert.equal(gauge.percentage, 0);
  assert.match(gauge.summary, /0 mm\/h · Sem chuva/);
});

test('rainGauge: chuva fraca, moderada e forte calculam percentual e nível corretos', () => {
  const light = insights.rainGauge(makeSeries(12, {mm: () => 1.2}), 0);
  assert.equal(light.level, 'light');
  assert.equal(light.active, true);
  assert.equal(light.label, 'Chuva fraca');
  assert.ok(light.percentage >= 10 && light.percentage <= 35);

  const moderate = insights.rainGauge(makeSeries(12, {mm: () => 5.0}), 0);
  assert.equal(moderate.level, 'moderate');
  assert.equal(moderate.active, true);
  assert.equal(moderate.label, 'Chuva moderada');
  assert.ok(moderate.percentage >= 35 && moderate.percentage <= 70);

  const heavy = insights.rainGauge(makeSeries(12, {mm: () => 15.0}), 0);
  assert.equal(heavy.level, 'heavy');
  assert.equal(heavy.active, true);
  assert.equal(heavy.label, 'Chuva forte');
  assert.ok(heavy.percentage >= 70);
});

test('rainGauge: código atual de trovoada ativa nível storm', () => {
  const storm = insights.rainGauge(makeSeries(12), 0, {current: {weather_code: 95}});
  assert.equal(storm.level, 'storm');
  assert.equal(storm.label, 'Tempestade');
  assert.equal(storm.active, true);
});

test('rainGauge: chuva se aproximando na próxima hora marca approaching', () => {
  const approaching = insights.rainGauge(makeSeries(12, {chance: () => 60, mm: () => 0}), 0);
  assert.equal(approaching.active, false);
  assert.equal(approaching.approaching, true);
  assert.match(approaching.summary, /60% de chance/);
});

test('pluviaConfidence: dados recentes e completos geram confiança alta', () => {
  const data = {hourly: makeSeries(24), current: {temperature_2m: 29}};
  const conf = insights.pluviaConfidence(data, {now: Date.now(), savedAt: Date.now() - 300000});
  assert.equal(conf.level, 'high');
  assert.equal(conf.label, 'Confiança alta');
  assert.ok(conf.score >= 80);
});

test('pluviaConfidence: dados reduzidos ou salvos há mais de 12h caem para menor precisão', () => {
  const staleData = {hourly: makeSeries(24), pluviaReduced: true};
  const conf = insights.pluviaConfidence(staleData, {now: Date.now(), savedAt: Date.now() - 15 * 3600000});
  assert.equal(conf.level, 'low');
  assert.equal(conf.label, 'Previsão com menor precisão');
  assert.equal(conf.note, 'Previsão com menor precisão');
});

test('pluviaConfidence: conexão de estação oficial incrementa score', () => {
  const data = {hourly: makeSeries(24)};
  const withoutStation = insights.pluviaConfidence(data, {now: 1000000, savedAt: 1000000});
  const withStation = insights.pluviaConfidence(data, {now: 1000000, savedAt: 1000000, station: {temperature: 31, stationName: 'INMET Manaus'}});
  assert.ok(withStation.score > withoutStation.score);
});
