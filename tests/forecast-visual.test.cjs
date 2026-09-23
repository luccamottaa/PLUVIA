const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
const renderForecastSource = app.slice(app.indexOf('function renderForecast('), app.indexOf('\nfunction renderSun('));
assert.ok(renderForecastSource.startsWith('function renderForecast('));

const list = {innerHTML: ''};
const renderForecast = vm.runInNewContext(`${renderForecastSource}\nrenderForecast`, {
  $: () => list,
  weather: () => ['Céu limpo'],
  weatherIcons: {markup: () => '', markupName: () => ''},
  fmt: number => Number.isFinite(number) ? String(number) : '--'
});

const daily = {
  time: ['2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27','2026-09-28','2026-09-29'],
  temperature_2m_min: [20,25,24,23,22,21,20],
  temperature_2m_max: [30,34,32,33,31,29,28],
  precipitation_probability_max: Array(7).fill(0),
  precipitation_sum: Array(7).fill(0),
  uv_index_max: Array(7).fill(5),
  weather_code: Array(7).fill(0)
};

renderForecast(daily, 27);
assert.match(list.innerHTML, /class="temp-fill" style="left:0\.0%;width:71\.4%"/);
assert.match(list.innerHTML, /class="temp-now" style="left:50\.0%"/);
assert.match(list.innerHTML, /class="temp-fill" style="left:35\.7%;width:64\.3%"/);
assert.equal((list.innerHTML.match(/class="temp-now"/g) || []).length, 1);

renderForecast(daily, 38);
assert.doesNotMatch(list.innerHTML, /class="temp-now"/, 'sem ponto atual se a leitura estiver fora da faixa prevista');

console.log('PASS: faixas de temperatura usam escala compartilhada e o ponto atual só aparece quando há dados compatíveis.');
