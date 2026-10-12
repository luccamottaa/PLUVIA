const test = require('node:test');
const assert = require('node:assert/strict');
const month = require('../dist/modules/month-recap.js');

const manaus = {id:'1302603', name:'Manaus', uf:'AM', lat:-3.119, lon:-60.022, timezone:'America/Manaus'};

// 30 dias completos (12/09 a 11/10) e hoje (12/10), como a consulta past_days=30&forecast_days=1 devolve.
function response(edit = () => {}) {
  const time = [], max = [], min = [], rain = [];
  for (let i = 0; i < 31; i++) {
    const at = new Date(Date.UTC(2026, 8, 12 + i));
    time.push(at.toISOString().slice(0, 10));
    max.push(32 + (i % 3)); min.push(23 + (i % 2)); rain.push(i % 5 === 0 ? 4 : 0);
  }
  const daily = {time, temperature_2m_max:max, temperature_2m_min:min, precipitation_sum:rain};
  edit(daily);
  return {daily};
}

test('uma consulta da cidade aberta com 30 dias passados e o fuso municipal', () => {
  const url = new URL(month.buildUrl(manaus));
  assert.equal(url.hostname, 'api.open-meteo.com');
  assert.equal(url.searchParams.get('past_days'), '30');
  assert.equal(url.searchParams.get('forecast_days'), '1');
  assert.equal(url.searchParams.get('timezone'), 'America/Manaus');
  assert.match(url.searchParams.get('daily'), /precipitation_sum/);
});

test('só dias completos antes de hoje no calendário municipal entram no resumo', () => {
  const summary = month.summarize(response(daily => {daily.precipitation_sum[30] = 80; daily.temperature_2m_max[30] = 45;}), '2026-10-12');
  assert.equal(summary.days.length, 30);
  assert.equal(summary.first, '2026-09-12');
  assert.equal(summary.last, '2026-10-11');
  assert.equal(summary.totalRain, 24, 'a chuva prevista para hoje não entra');
  assert.equal(summary.rainyDays, 6);
  assert.equal(summary.hottest.value, 34, 'a máxima prevista para hoje não entra');
  assert.equal(summary.coldest.value, 23);
  assert.equal(summary.coldest.date, '2026-09-12');
  assert.equal(summary.wettest.value, 4);
  assert.match(month.headline(summary), /6 dos últimos 30 dias/);
});

test('dias ausentes nunca viram zero: com poucos dias o total de chuva fica indisponível', () => {
  const partial = month.summarize(response(daily => {for (let i = 0; i < 2; i++) daily.precipitation_sum[i] = null;}), '2026-10-12');
  assert.equal(partial.covered.rain, 28);
  assert.equal(partial.totalRain, 20, 'com quase todos os dias o total aparece, com a cobertura informada');
  const missing = month.summarize(response(daily => {for (let i = 0; i < 6; i++) daily.precipitation_sum[i] = null;}), '2026-10-12');
  assert.equal(missing.totalRain, null);
  assert.equal(missing.rainyDays, null);
  assert.equal(missing.wettest, null);
  assert.equal(month.headline(missing), '');
  const bogus = month.summarize(response(daily => {daily.temperature_2m_max = daily.temperature_2m_max.map(() => 'quente');}), '2026-10-12');
  assert.equal(bogus.hottest, null);
  assert.equal(bogus.meanHigh, null);
});

test('mês seco não inventa dia mais chuvoso e diz que não choveu 1 mm', () => {
  const dry = month.summarize(response(daily => {daily.precipitation_sum = daily.precipitation_sum.map(() => 0.2);}), '2026-10-12');
  assert.equal(dry.rainyDays, 0);
  assert.equal(dry.wettest, null);
  assert.match(month.headline(dry), /Nenhum dia com chuva de 1 mm/);
});

test('resposta sem datas ou dia de hoje inválido é rejeitada', () => {
  assert.throws(() => month.summarize({}, '2026-10-12'), /inválida/);
  assert.throws(() => month.summarize(response(), null), /inválida/);
});
