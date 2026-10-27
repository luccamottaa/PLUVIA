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
const number = (value, digits = 1) => value.toFixed(digits).replace('.', ',');

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

test('boletim do aeroporto: trovoada relatada vence tudo; chuva relatada entra depois da estação', () => {
  // SPECI SBEG 130518Z ... TSRA (01:18 em Manaus) e METAR SBMN 131624Z SHRA.
  const tsra = {icao:'SBEG', distanceKm:9.5, at:Date.parse('2026-10-13T05:18:00Z'),
    weather:{rain:'moderate', showers:false, drizzle:false, thunder:true, nearbyShowers:false, nearbyThunder:false}};
  const storm = observed.pick({airport:tsra, station, now:tsra.at + 10 * 60_000});
  assert.equal(storm.source, 'airport');
  assert.equal(storm.code, 95);
  assert.equal(storm.stormSource, 'airport');
  assert.equal(observed.label(storm, 'Trovoadas'), 'Chuva com trovoada');
  assert.equal(observed.answer(storm, {time, number}).text, 'Trovoada com chuva agora, segundo o aeroporto mais próximo (SBEG, a 10 km), às 01:18.');
  assert.equal(observed.withStorm(storm, 4000), storm, 'confirmada não vira "provável"');
  const dryThunder = observed.pick({airport:{...tsra, weather:{...tsra.weather, rain:null}}, now:tsra.at});
  assert.equal(observed.label(dryThunder, 'Trovoadas'), 'Trovoada');
  const shra = {icao:'SBMN', distanceKm:3, at:Date.parse('2026-10-13T16:24:00Z'),
    weather:{rain:'moderate', showers:true, drizzle:false, thunder:false, nearbyShowers:false, nearbyThunder:false}};
  const showers = observed.pick({airport:shra, now:shra.at + 5 * 60_000});
  assert.equal(showers.code, 81);
  assert.equal(observed.answer(showers, {time, number}).text, 'Pancadas de chuva agora, segundo o aeroporto mais próximo (SBMN, a 3 km), às 12:24.');
  // A estação mede no chão: com chuva medida, ela é a fonte (o aeroporto só confirma trovoada).
  assert.equal(observed.pick({airport:shra, station, now:at + 20 * 60_000}).source, 'station');
  assert.equal(observed.pick({airport:{...shra, at:shra.at - 80 * 60_000}, now:shra.at}), null, 'boletim velho');
});

test('trovoada nas proximidades confirma tempestade com chuva medida; sem chuva, só avisa que pode chegar', () => {
  const vcts = {icao:'SBEG', distanceKm:9.5, at:Date.parse('2026-10-13T16:00:00Z'),
    weather:{rain:null, showers:false, drizzle:false, thunder:false, nearbyShowers:true, nearbyThunder:true}};
  const confirmed = observed.pick({station, airport:vcts, now:at + 10 * 60_000});
  assert.equal(confirmed.code, 95);
  assert.equal(confirmed.stormSource, 'nearby');
  assert.match(observed.answer(confirmed, {time, number}).text, /5,0 mm medidos pela estação do INMET \(11:00–12:00\)\. O aeroporto mais próximo \(SBEG, a 10 km\) relatou trovoada nas proximidades às 12:00\.$/);
  assert.equal(observed.pick({airport:vcts, now:vcts.at}), null, 'nas proximidades não muda a condição');
  const close = observed.nearby({airport:vcts, now:vcts.at});
  assert.equal(close.thunder, true);
  const text = observed.nearbyAnswer(close, {time, number});
  assert.equal(text.tone, 'maybe');
  assert.equal(text.text, 'Trovoada nas proximidades: o aeroporto mais próximo (SBEG, a 10 km) relatou às 12:00. A chuva pode chegar.');
  assert.equal(observed.nearby({airport:{...vcts, weather:{...vcts.weather, nearbyThunder:false, nearbyShowers:false}}, now:vcts.at}), null);
});

test('o app carrega o módulo antes de app.js e só repinta condição, céu e "Vai chover?"', () => {
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '../dist/sw.js'), 'utf8');
  assert.ok(html.indexOf('modules/observed-rain.js?v=observed-rain-4') > 0);
  assert.ok(html.indexOf('modules/observed-rain.js') < html.indexOf('app.js?v='));
  assert.match(sw, /modules\/observed-rain\.js\?v=observed-rain-4/);
  const app = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8');
  const refresh = app.slice(app.indexOf('function refreshObservedRain()'), app.indexOf('globalThis.addEventListener?.("pluvia:station-reading"'));
  assert.doesNotMatch(refresh, /render\(|pluvia:weather-updated/, 'repintar não dispara outra rodada de consultas');
  const station = fs.readFileSync(path.join(__dirname, '../dist/modules/station-now.js'), 'utf8');
  assert.match(station, /pluvia:station-reading/);
});

test('medição seca desmente garoa/chuva fraca do modelo (radar sem eco + terra seca)', () => {
  // Manaus, 27/10/2026: o modelo dava garoa fraca (51) com sol e poucas nuvens no céu.
  const now = Date.parse('2026-10-27T19:30:00Z');
  const radar = {status:'ready', precipitating:false, frameAt:now - 8 * 60_000};
  const dryStation = {at:now - 20 * 60_000, rainMm:0};
  const dryAirport = {at:now - 15 * 60_000, weather:{rain:null, drizzle:false, thunder:false}};
  assert.equal(observed.dryNow({radar, station:dryStation, now}), true);
  assert.equal(observed.dryNow({radar, airport:dryAirport, now}), true);
  // Só o radar não basta (garoa fina pode passar abaixo do eco); radar velho, com eco ou estação molhada também não.
  assert.equal(observed.dryNow({radar, now}), false);
  assert.equal(observed.dryNow({radar:{...radar, frameAt:now - 40 * 60_000}, station:dryStation, now}), false);
  assert.equal(observed.dryNow({radar:{...radar, precipitating:true}, station:dryStation, now}), false);
  assert.equal(observed.dryNow({radar, station:{...dryStation, rainMm:0.4}, now}), false);
  assert.equal(observed.dryNow({radar, airport:{...dryAirport, weather:{drizzle:true}}, now}), false);
  assert.equal(observed.dryNow({radar, station:{...dryStation, at:now - 2 * 3600_000}, now}), false);
  // Só os códigos fracos viram secos, pela cobertura de nuvens; moderada/forte e trovoada continuam.
  assert.equal(observed.dryCode(51, 30), 1);
  assert.equal(observed.dryCode(61, 60), 2);
  assert.equal(observed.dryCode(80, 95), 3);
  assert.equal(observed.dryCode(53, null), 3);
  for (const code of [63, 65, 81, 82, 95, 2, 3]) assert.equal(observed.dryCode(code, 30), code);
  // No app: sem chuva observada, a condição do topo usa o código seco e a chave de repintura muda com isso.
  const app = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8');
  assert.match(app, /api\?\.dryNow\?\.\(observedSources\(\)\) \|\| weak\) \? api\.dryCode\(current\.weather_code, current\.cloud_cover\)/);
  assert.match(app, /dryNow\?\.\(observedSources\(\)\) \? "dry" : ""/);
});

test('garoa que o próprio modelo não sustenta sai do topo (1.37.3, todas as cidades)', () => {
  // Placar, 27 capitais: com 0,1–0,5 mm na hora o modelo acertou chuva em 15% das vezes; com chance < 30%, em 7%.
  assert.equal(observed.weakModelRain(51, .1, 20), true);
  assert.equal(observed.weakModelRain(61, .4, 45), true);
  assert.equal(observed.weakModelRain(80, 0, 10), true);
  assert.equal(observed.weakModelRain(61, .6, 20), false, 'meio milímetro ou mais: chuva do modelo continua');
  assert.equal(observed.weakModelRain(51, .2, 50), false, 'chance de 50% ou mais continua');
  assert.equal(observed.weakModelRain(63, .1, 10), false, 'chuva moderada não é tocada');
  assert.equal(observed.weakModelRain(95, 0, 5), false, 'trovoada não é tocada');
  assert.equal(observed.weakModelRain(51, null, 10), false, 'volume ausente não vira seco');
  assert.equal(observed.weakModelRain(51, .1, undefined), false, 'chance ausente não vira seco');
  assert.equal(observed.dryCode(51, 30), 1); assert.equal(observed.dryCode(51, 60), 2); assert.equal(observed.dryCode(51, 90), 3);
  const app = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8');
  assert.match(app, /weakModelRain\?\.\(current\?\.weather_code, data\.hourly\?\.precipitation\?\.\[next\], data\.hourly\?\.precipitation_probability\?\.\[next\]\)/, 'intervalo que começa agora: i+1');
});
