const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
const source = app.slice(app.indexOf('function renderSmoke('), app.indexOf('\nfunction render(', app.indexOf('function renderSmoke(')));
const now = Date.parse('2026-09-23T18:20:00Z');
const hourly = Array.from({length: 24}, (_, index) => new Date(Date.parse('2026-09-23T16:00:00Z') + index * 3600000).toISOString().slice(0, 16));

function screen() {
  const elements = Object.fromEntries(['smokePm25', 'smokeStatus', 'smokeTrend'].map(id => [id, {textContent: '', innerHTML: ''}]));
  const renderSmoke = vm.runInNewContext(`${source}\nrenderSmoke`, {
    $: id => elements[id],
    fmt: (value, digits = 0) => value.toFixed(digits).replace('.', ','),
    shortTime: time => time.slice(11, 16),
    cityDate: time => new Date(`${time}Z`),
    Date: class extends Date { static now() { return now; } }
  });
  return {renderSmoke, elements};
}

test('mostra PM2,5 e tendência com hora e unidade, inclusive leitura zero', () => {
  const {renderSmoke, elements} = screen();
  renderSmoke({current:{pm2_5:0,time:'2026-09-23T18:00'},hourly:{time:hourly,pm2_5:hourly.map((_, i) => i)}});
  assert.equal(elements.smokePm25.textContent, '0,0');
  assert.match(elements.smokeStatus.textContent, /Estimativa regional · 18:00/);
  assert.match(elements.smokeTrend.innerHTML, /Agora<\/span><strong>2<\/strong><small>µg\/m³/);
  assert.match(elements.smokeTrend.innerHTML, /22:00<\/span><strong>6/);
  assert.equal((elements.smokeTrend.innerHTML.match(/class="smoke-hour"/g) || []).length, 4);
});

test('não apresenta uma previsão vencida como Agora nem simula dado ausente', () => {
  const {renderSmoke, elements} = screen();
  renderSmoke({current:{pm2_5:12,time:'2026-09-22T18:00'},hourly:{time:['2026-09-22T18:00'],pm2_5:[12]}}, true);
  assert.match(elements.smokeStatus.textContent, /Leitura anterior/);
  assert.equal(elements.smokeTrend.textContent, 'Previsão de partículas indisponível.');
  renderSmoke({current:{pm2_5:null,time:'2026-09-23T18:00'},hourly:{time:hourly,pm2_5:[12]}});
  assert.equal(elements.smokePm25.textContent, '--');
  assert.equal(elements.smokeTrend.textContent, 'Previsão de partículas indisponível.');
});

test('a interface explica que partículas não confirmam fumaça de queimadas', () => {
  assert.match(html, /FUMAÇA E PARTÍCULAS/);
  assert.match(html, /PM2,5 inclui partículas que podem estar na fumaça de queimadas/);
  assert.match(html, /não confirma fumaça no seu endereço/);
});
