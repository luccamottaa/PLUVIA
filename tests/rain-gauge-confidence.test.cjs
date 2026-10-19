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

test('rainGauge: dia seco fica escondido, sem "0 mm/h"', () => {
  const gauge = insights.rainGauge(makeSeries(12), 0, {current: {weather_code: 3}});
  assert.equal(gauge.active, false);
  assert.equal(gauge.approaching, false);
  assert.equal(gauge.percentage, 0);
});

test('rainGauge: volume do modelo é dito como previsão da próxima hora (i+1)', () => {
  const light = insights.rainGauge(makeSeries(12, {mm: () => 1.2}), 0);
  assert.equal(light.level, 'light'); assert.equal(light.source, 'forecast');
  assert.equal(light.summary, 'Chuva fraca · 1,2 mm previstos na próxima hora');
  const moderate = insights.rainGauge(makeSeries(12, {mm: () => 5}), 0);
  assert.equal(moderate.level, 'moderate'); assert.ok(moderate.percentage >= 35 && moderate.percentage <= 70);
  const heavy = insights.rainGauge(makeSeries(12, {mm: () => 15}), 0);
  assert.equal(heavy.level, 'heavy'); assert.ok(heavy.percentage >= 70);
});

test('rainGauge: código de chuva sem volume não inventa mm/h', () => {
  const gauge = insights.rainGauge(makeSeries(12), 0, {current: {weather_code: 63}});
  assert.equal(gauge.active, true); assert.equal(gauge.label, 'Chuva moderada');
  assert.equal(gauge.mm, null); assert.ok(!/mm/.test(gauge.summary));
});

test('rainGauge: trovoada muda a cor, mas não enche a barra sem chuva', () => {
  const dryStorm = insights.rainGauge(makeSeries(12), 0, {current: {weather_code: 95}});
  assert.equal(dryStorm.level, 'storm'); assert.equal(dryStorm.percentage, 0);
  assert.match(dryStorm.summary, /sem volume/);
  const wetStorm = insights.rainGauge(makeSeries(12, {mm: () => 1}), 0, {current: {weather_code: 95}});
  assert.equal(wetStorm.level, 'storm'); assert.ok(wetStorm.percentage < 35);
  assert.equal(wetStorm.summary, 'Trovoada · chuva fraca · 1,0 mm previstos na próxima hora');
});

test('rainGauge: observação vence o modelo e diz a fonte', () => {
  const dry = makeSeries(12);
  const station = insights.rainGauge(dry, 0, {observed: {source: 'station', mm: 5.2, code: 63}});
  assert.equal(station.source, 'measured'); assert.equal(station.summary, 'Chuva moderada · 5,2 mm medidos na última hora');
  const radar = insights.rainGauge(dry, 0, {observed: {source: 'radar', mm: null, code: 61}});
  assert.equal(radar.label, 'Chuva agora'); assert.ok(!/mm/.test(radar.summary));
  const airportThunder = insights.rainGauge(dry, 0, {observed: {source: 'airport', mm: null, code: 95, storm: true, rain: null}});
  assert.equal(airportThunder.percentage, 0); assert.equal(airportThunder.summary, 'Trovoada agora, sem chuva relatada');
  const airportRain = insights.rainGauge(dry, 0, {observed: {source: 'airport', mm: null, code: 95, storm: true, rain: 'heavy'}});
  assert.equal(airportRain.label, 'Trovoada · chuva forte'); assert.equal(airportRain.mm, null);
});

test('rainGauge: chance na próxima hora sem chuva agora', () => {
  const approaching = insights.rainGauge(makeSeries(12, {chance: () => 60}), 0);
  assert.equal(approaching.active, false); assert.equal(approaching.approaching, true);
  assert.match(approaching.summary, /60% de chance/);
});
