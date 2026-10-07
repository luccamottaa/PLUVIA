const test = require('node:test');
const assert = require('node:assert/strict');
const events = require('../dist/modules/sky-events.js');

const minutes = (a, b) => Math.abs(a - b) / 60000;

test('fases da Lua por Meeus coincidem com efemérides publicadas em poucos minutos', () => {
  // Lua nova do eclipse total de 08/04/2024 (18:21 UT) e lua cheia de 23/04/2024 (23:49 UT).
  const april = events.nextPhases(Date.parse('2024-04-01T00:00:00Z'));
  assert.ok(minutes(april.new, Date.parse('2024-04-08T18:21:00Z')) < 5, new Date(april.new).toISOString());
  assert.ok(minutes(april.full, Date.parse('2024-04-23T23:49:00Z')) < 5, new Date(april.full).toISOString());
  // Lua cheia de 03/01/2026 (10:03 UT).
  const january = events.nextPhases(Date.parse('2026-01-01T00:00:00Z'));
  assert.ok(minutes(january.full, Date.parse('2026-01-03T10:03:00Z')) < 5, new Date(january.full).toISOString());
  assert.ok(january.new > january.full, 'devolve a próxima de cada tipo depois do instante');
  assert.deepEqual(events.nextPhases(NaN), {full:null, new:null});
});

test('próxima chuva de meteoros respeita a data municipal e a altura do radiante na latitude', () => {
  assert.equal(events.nextShower('2026-10-07', -3.1).id, 'ORI');
  assert.equal(events.nextShower('2026-10-21', -3.1).id, 'ORI', 'a noite do pico ainda conta');
  assert.equal(events.nextShower('2026-10-22', -3.1).id, 'LEO');
  // Ursídeas (radiante +75°) não sobem 20° nem em Manaus; depois delas, sem dados do ano seguinte.
  assert.equal(events.nextShower('2026-12-20', -30), null);
  assert.equal(events.nextShower('2026-12-20', -3.1), null);
  assert.equal(events.nextShower('2026-12-01', -30).id, 'GEM', 'Geminídeas (+33°) chegam a 27° em Porto Alegre');
  assert.equal(events.nextShower('2026-12-01', 2.8).radiantAltitude, 60, 'Boa Vista (hemisfério norte)');
  assert.equal(events.nextShower('2026-08-01', -30).id, 'ORI', 'Perseidas (+58°) quase não aparecem a 30°S');
  assert.equal(events.nextShower('2027-01-01', -3.1), null);
  assert.equal(events.nextShower('ontem', -3.1), null);
});
