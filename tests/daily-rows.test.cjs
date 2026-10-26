const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const layerRows = require('../dist/modules/weather-data-layer.js').rows;

const app = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
const source = app.slice(app.indexOf('function renderForecast('), app.indexOf('\nfunction solarArcPoint('));

function render(daily, mode = 'conditions', hourly = []) {
  const list = {innerHTML:''};
  const ctx = {
    $:id => id === 'forecastList' ? list : null, activeCity:{id:'1302603'}, Intl,
    globalThis:{PLUVIA:{time:{dayKey:() => '2026-10-10'}}},
    fmt:(value,digits=0) => Number.isFinite(value) ? value.toFixed(digits).replace('.',',') : '--',
    weather:() => ['Chuva fraca'],
    weatherIcons:{markup:() => '<svg></svg>', markupName:() => '<i></i>'}, hourlyMode:mode, rainFill:mm => Math.sqrt(Math.min(Math.max(mm,0),10)/10)
  };
  vm.runInNewContext(`${source}\nrenderForecast(daily, 30, 0, hourly)`, {...ctx, daily:layerRows(null,{daily}).daily, hourly});
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

// Horas do dia 10: intervalos que terminam de 01:00 do dia 10 até 00:00 do dia 11 (o primeiro, que termina à
// meia-noite do dia 10, é de ontem).
function hours(rain, wind) {
  const rows = [];
  for (let h = 0; h <= 24; h++) {
    const day = h === 24 ? '2026-10-11' : '2026-10-10', hh = String(h % 24).padStart(2, '0');
    rows.push({time:`${day}T${hh}:00`, precipitation:rain(h), windSpeed:wind(h), windGust:wind(h) === null ? null : wind(h) * 2});
  }
  return rows;
}

test('7 dias no modo Chuva: 24 barras do dia pelo volume, hora ausente tracejada', () => {
  const html = render(daily, 'rain', hours(h => h === 0 ? 99 : h === 5 ? null : h === 12 ? 10 : 0, () => 5));
  const row = html.split('<button').slice(1)[0];
  const bars = row.match(/day-rain[^>]*>(.*?)<\/span>/)[1].match(/<i[^>]*><\/i>/g);
  assert.equal(bars.length, 24);
  assert.match(bars[4], /data-missing/, 'hora ausente não vira seca');
  assert.match(bars[11], /--fill:100%/, '10 mm enche a barra');
  assert.match(bars[0], /--fill:0%/, 'os 99 mm da hora que termina à meia-noite do dia 10 são de ontem');
  assert.match(row, /<span class="forecast-rain-volume">0,2 mm<\/span>/, 'no modo Chuva o total aparece mesmo abaixo de 0,5 mm');
});

test('7 dias no modo Vento: menor e maior velocidade e rajada, só com horas suficientes', () => {
  const rows = render(daily, 'wind', hours(() => 0, h => 4 + h)).split('<button').slice(1);
  assert.match(rows[0], /aria-label="Vento de 5 a 28 quilômetros por hora"/);
  assert.match(rows[0], /<span class="forecast-rain-chance">56<\/span>/);
  assert.match(rows[1], /Vento indisponível/, 'sem horas do dia 11, não inventa vento');
  const few = render(daily, 'wind', hours(() => 0, h => h < 10 ? 6 : null)).split('<button').slice(1);
  assert.match(few[0], /Vento indisponível/, 'menos de 18 horas válidas não vira faixa');
});
