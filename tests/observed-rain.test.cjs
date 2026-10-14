const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const observed = require('../dist/modules/observed-rain.js');

// Manaus, 13/10/2026: a estação do INMET mediu 5,0 mm entre 11h e 12h (15–16Z) enquanto o modelo
// dizia parcialmente nublado ou garoa de 0,1 mm.
const at = Date.parse('2026-10-13T16:00:00Z');
const station = {ibge:'1302603', at, temperature:26.3, humidity:90, rainMm:5.0};
const time = value => new Date(value - 4 * 3600_000).toISOString().slice(11, 16);
const number = value => value.toFixed(1).replace('.', ',');

test('chuva medida pela estação vira chuva no topo, com intensidade pelo volume', () => {
  const now = at + 20 * 60_000;
  const reading = observed.pick({station, now});
  assert.equal(reading.source, 'station');
  assert.equal(reading.code, 63, '5 mm/h é chuva moderada');
  assert.equal(observed.merge(2, reading), 63, 'parcialmente nublado vira chuva');
  assert.equal(observed.merge(51, reading), 63, 'garoa de 0,1 mm vira a chuva medida');
  assert.equal(observed.merge(95, reading), 95, 'trovoada do modelo continua trovoada');
  assert.equal(observed.merge(65, reading), 65, 'chuva forte do modelo não é rebaixada');
  assert.equal(observed.codeFor(0.4), 61);
  assert.equal(observed.codeFor(9), 65);
  const answer = observed.answer(reading, {time, number});
  assert.equal(answer.tone, 'rain');
  assert.equal(answer.text, 'Chuva na última hora: 5,0 mm medidos pela estação do INMET (11:00–12:00).');
});

test('só eleva: estação sem chuva, leitura velha ou ausente não muda a previsão', () => {
  const now = at + 20 * 60_000;
  assert.equal(observed.pick({station:{...station, rainMm:0}, now}), null, 'sem chuva na estação não vira "seco"');
  assert.equal(observed.pick({station:{...station, rainMm:0.1}, now}), null, 'abaixo do menor registro do pluviômetro');
  assert.equal(observed.pick({station:{...station, rainMm:null}, now}), null);
  assert.equal(observed.pick({station, now:at + 50 * 60_000}), null, 'mais de 45 min depois da leitura já não é agora');
  assert.equal(observed.pick({station, now:at - 30 * 60_000}), null, 'leitura no futuro');
  assert.equal(observed.pick({now}), null);
  assert.equal(observed.merge(2, null), 2);
  assert.equal(observed.answer(null, {time, number}), null);
});

test('radar recente com eco em cima da cidade diz só "Chuva", sem inventar intensidade', () => {
  const frameAt = Date.parse('2026-10-13T16:10:00Z');
  const radar = {status:'ready', precipitating:true, frameAt, cityId:'1302603'};
  const reading = observed.pick({radar, now:frameAt + 8 * 60_000});
  assert.equal(reading.source, 'radar');
  assert.equal(observed.label(reading, 'Chuva fraca'), 'Chuva');
  assert.equal(observed.answer(reading, {time, number}).text, 'Chuva no radar agora, em cima da cidade (imagem das 12:10).');
  assert.equal(observed.pick({radar, now:frameAt + 25 * 60_000}), null, 'imagem velha');
  assert.equal(observed.pick({radar:{...radar, precipitating:false}, now:frameAt}), null, 'sem eco não prova céu seco: nada muda');
  assert.equal(observed.pick({radar:{...radar, status:'unavailable'}, now:frameAt}), null);
  assert.equal(observed.pick({radar:{...radar, frameAt:null}, now:frameAt}), null);
  // A estação tem prioridade (mede no chão e dá a intensidade).
  assert.equal(observed.pick({station, radar, now:at + 15 * 60_000}).source, 'station');
  assert.notEqual(observed.key(observed.pick({station, now:at})), observed.key(observed.pick({radar, now:frameAt})));
  assert.equal(observed.key(null), '');
});

test('chuva medida em ar muito instável vira trovoada provável e liga os raios', () => {
  // CAPE de Manaus em 13/10/2026 ao meio-dia: 2.330 J/kg.
  const now = at + 20 * 60_000;
  const storm = observed.withStorm(observed.pick({station, now}), 2330);
  assert.equal(storm.code, 95);
  assert.equal(storm.storm, true);
  assert.equal(observed.merge(51, storm), 95, 'garoa do modelo vira trovoada');
  assert.equal(observed.merge(65, storm), 95);
  assert.equal(observed.label(storm, 'Trovoadas'), 'Chuva com trovoada');
  const answer = observed.answer(storm, {time, number});
  assert.equal(answer.tone, 'storm');
  assert.match(answer.text, /5,0 mm medidos pela estação do INMET \(11:00–12:00\)\. Ar muito instável: trovoada provável\.$/);
  assert.notEqual(observed.key(storm), observed.key(observed.pick({station, now})), 'virar trovoada repinta o topo');
  // Ar estável, CAPE ausente ou sem chuva medida: nada de trovoada inventada.
  assert.equal(observed.withStorm(observed.pick({station, now}), 900).code, 63);
  assert.equal(observed.withStorm(observed.pick({station, now}), null).code, 63);
  assert.equal(observed.withStorm(null, 4600), null);
});

test('o app carrega o módulo antes de app.js e só repinta condição, céu e "Vai chover?"', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '../dist/sw.js'), 'utf8');
  assert.ok(html.indexOf('modules/observed-rain.js?v=observed-rain-1') > 0);
  assert.ok(html.indexOf('modules/observed-rain.js') < html.indexOf('app.js?v='));
  assert.match(sw, /modules\/observed-rain\.js\?v=observed-rain-1/);
  const app = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8');
  const refresh = app.slice(app.indexOf('function refreshObservedRain()'), app.indexOf('globalThis.addEventListener?.("pluvia:station-reading"'));
  assert.doesNotMatch(refresh, /render\(|pluvia:weather-updated/, 'repintar não dispara outra rodada de consultas');
  const station = fs.readFileSync(path.join(__dirname, '../dist/modules/station-now.js'), 'utf8');
  assert.match(station, /pluvia:station-reading/);
});
