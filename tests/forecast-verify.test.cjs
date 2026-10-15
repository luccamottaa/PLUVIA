const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Módulo ES compartilhado das funções Supabase, carregado num VM como em station-now.test.
const code = fs.readFileSync('supabase/functions/_shared/forecast-verify.js', 'utf8');
const names = [...code.matchAll(/^export (?:const|function) (\w+)/gm)].map(match => match[1]);
const context = vm.createContext({URL, Date, Number, Math, Array, Error, JSON});
const api = vm.runInContext(`(() => {\n${code.replace(/^export /gm, '')}\nreturn {${names.join(', ')}};\n})()`, context);

const HOUR = 3600e3;
const now = Date.parse('2026-10-14T15:40:00Z'), base = Date.parse('2026-10-14T15:00:00Z');
function entry(overrides = {}) {
  const time = Array.from({length:72}, (_, i) => (base - 15 * HOUR + i * HOUR) / 1000);
  const hourly = {time};
  for (const model of api.MODELS) {
    hourly[`temperature_2m_${model}`] = time.map(() => 30);
    hourly[`precipitation_${model}`] = time.map(() => 0);
  }
  return {hourly:{...hourly, ...overrides}};
}

test('URL pede as 27 capitais e os quatro modelos com vírgulas literais', () => {
  const url = api.forecastUrl();
  assert.equal(api.CAPITALS.length, 27);
  assert.match(url, /latitude=-10\.911,-1\.456,/);
  assert.match(url, /models=best_match,ecmwf_ifs025,gfs_seamless,icon_seamless/);
  assert.doesNotMatch(url, /%2C/);
});

test('amostras: 6 h e 24 h à frente da hora cheia, por cidade e modelo', () => {
  const cities = api.CAPITALS.slice(0, 2);
  const samples = api.buildSamples([entry(), entry()], cities, now);
  assert.equal(samples.length, 2 * 2 * 4);
  const targets = [...new Set(samples.map(s => s.target_at))].sort();
  assert.deepEqual(targets, ['2026-10-14T21:00:00.000Z', '2026-10-15T15:00:00.000Z']);
  assert.ok(samples.every(s => s.temp_c === 30 && s.precip_mm === 0));
});

test('valores inválidos ou ausentes não viram zero; modelo sem nada fica de fora', () => {
  const cities = api.CAPITALS.slice(0, 1);
  const time = entry().hourly.time.length;
  const broken = entry({temperature_2m_gfs_seamless:Array(time).fill(null), precipitation_gfs_seamless:Array(time).fill('x'),
    temperature_2m_icon_seamless:Array(time).fill(99)});
  const samples = api.buildSamples([broken], cities, now);
  assert.ok(!samples.some(s => s.model === 'gfs_seamless'));
  assert.ok(samples.filter(s => s.model === 'icon_seamless').every(s => s.temp_c === null && s.precip_mm === 0));
  assert.throws(() => api.buildSamples([entry()], api.CAPITALS.slice(0, 2), now), /invalid_provider_data/);
});

test('observação só na hora cheia, com estação, e ausências como null', () => {
  const city = api.CAPITALS[14];
  const reading = {station:{ibge:'1302603', distanceKm:4.2}, time:'2026-10-14T15:00:00.000Z', temperatureC:31.4, rainMm:null};
  assert.deepEqual(JSON.parse(JSON.stringify(api.observationFrom(city, reading))),
    {city_id:'1302603', observed_at:'2026-10-14T15:00:00.000Z', temp_c:31.4, precip_mm:null, station_ibge:'1302603', distance_km:4.2});
  assert.equal(api.observationFrom(city, {...reading, time:'2026-10-14T15:30:00.000Z'}), null);
  assert.equal(api.observationFrom(city, {station:null}), null);
  assert.equal(api.observationFrom(city, {...reading, temperatureC:null}), null);
});

test('amostras guardam a probabilidade de chuva; modelo sem ela fica com null', () => {
  const cities = api.CAPITALS.slice(0, 1);
  const time = entry().hourly.time.length;
  const data = entry({precipitation_probability_best_match:Array(time).fill(42.6)});
  const samples = api.buildSamples([data], cities, now);
  assert.ok(samples.filter(s => s.model === 'best_match').every(s => s.precip_prob === 43));
  assert.ok(samples.filter(s => s.model !== 'best_match').every(s => s.precip_prob === null));
  assert.match(api.forecastUrl(), /hourly=temperature_2m,precipitation,precipitation_probability&/);
});

test('janela "Vai chover?" usa a regra do app: chuva, pode chover ou seco', () => {
  const h = (mm, prob = null) => ({mm, prob});
  assert.equal(api.windowAnswer([h(0), h(0.5), h(0)]), 'rain');
  assert.equal(api.windowAnswer([h(0.05, 80), h(0), h(0)]), 'maybe', 'chance alta com volume desprezível não é chuva');
  assert.equal(api.windowAnswer([h(null, 60), h(0), h(0)]), 'rain', 'chance ≥ 50% sem volume conta, como no app');
  assert.equal(api.windowAnswer([h(0.2, 35), h(0, 10), h(0, 0)]), 'maybe');
  assert.equal(api.windowAnswer([h(0.2, 20), h(0), h(0)]), 'dry');
});

test('janelas de 3 h e 12 h começam na hora cheia, cobrem +1 h a +N h e exigem horas completas', () => {
  const cities = api.CAPITALS.slice(0, 1);
  const data = entry();
  const at = data.hourly.time.indexOf(base / 1000);
  data.hourly.precipitation_best_match[at] = 9; // hora que termina agora: fora da janela
  data.hourly.precipitation_best_match[at + 5] = 1.2; // termina às +5 h: só na de 12 h
  data.hourly.precipitation_probability_best_match = data.hourly.time.map(() => 10);
  const windows = api.buildWindows([data], cities, now);
  assert.equal(windows.length, 4 * 2);
  const best = size => windows.find(w => w.model === 'best_match' && w.window_hours === size);
  assert.deepEqual(JSON.parse(JSON.stringify(best(3))), {city_id:'2800308', model:'best_match', issued_at:'2026-10-14T15:00:00.000Z', window_hours:3, answer:'dry', max_prob:10, total_mm:0});
  assert.equal(best(12).answer, 'rain');
  assert.equal(best(12).total_mm, 1.2);
  assert.equal(windows.find(w => w.model === 'gfs_seamless').max_prob, null, 'sem probabilidade, max_prob null');
  // Uma hora sem volume nem chance descarta a janela (nunca vira seco).
  const hole = entry();
  hole.hourly.precipitation_ecmwf_ifs025[at + 2] = null;
  const kept = api.buildWindows([hole], cities, now).filter(w => w.model === 'ecmwf_ifs025');
  assert.equal(kept.length, 0);
});
