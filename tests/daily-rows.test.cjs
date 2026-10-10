const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
const source = app.slice(app.indexOf('function renderForecast('), app.indexOf('\nfunction solarArcPoint('));

function render(daily) {
  const list = {innerHTML:''};
  const ctx = {
    $:id => id === 'forecastList' ? list : null, activeCity:{id:'1302603'}, Intl,
    globalThis:{PLUVIA:{time:{dayKey:() => '2026-10-10'}}},
    fmt:(value,digits=0) => Number.isFinite(value) ? value.toFixed(digits).replace('.',',') : '--',
    weather:() => ['Chuva fraca'],
    weatherIcons:{markup:() => '<svg></svg>', markupName:() => '<i></i>'}
  };
  vm.runInNewContext(`${source}\nrenderForecast(daily, 30, 0)`, {...ctx, daily});
  return list.innerHTML;
}

const daily = {
  time:['2026-10-10','2026-10-11','2026-10-12'],
  weather_code:[61,3,61], temperature_2m_min:[28,28,27], temperature_2m_max:[37,37,35],
  precipitation_probability_max:[49,41,61], precipitation_sum:[0.2,0.1,2.1], uv_index_max:[9,9,9]
};

test('7 dias: uma linha por dia, sem a nota de chuva/UV visível', () => {
  const html = render(daily);
  assert.doesNotMatch(html, /forecast-uv/, 'a nota embaixo do dia saiu');
  // O texto continua para leitores de tela, dentro do trecho visualmente oculto.
  assert.match(html, /<span class="peek-extra">\. Chuva isolada, UV 9 muito alto\. Ver detalhes\. <\/span>/);
  assert.match(html, /<span class="peek-extra">\. Chuva provável, com baixo acumulado, UV 9 muito alto\. Ver detalhes\. <\/span>/);
});

test('7 dias: volume abaixo de 0,5 mm sai da linha visível, mas não do leitor de tela', () => {
  const rows = render(daily).split('<button').slice(1);
  assert.doesNotMatch(rows[0], /forecast-rain-volume/);
  assert.match(rows[0], /<span class="forecast-rain-chance">49%<\/span><span class="peek-extra">, 0,2 mm<\/span>/);
  assert.match(rows[2], /<span class="forecast-rain-volume">2,1 mm<\/span>/);
  // Volume ausente continua explícito ("--"), nunca some como se fosse seco.
  const missing = render({...daily, precipitation_sum:[null,0.1,2.1]}).split('<button').slice(1);
  assert.match(missing[0], /<span class="forecast-rain-volume">-- mm<\/span>/);
});
