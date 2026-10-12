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
  // Ursídeas (radiante +75°) não sobem 20° nem em Manaus; Quadrântidas (+49°) só no Norte.
  assert.equal(events.nextShower('2026-12-20', -30).night, '2027-04-22');
  assert.equal(events.nextShower('2026-12-20', -3.1).night, '2027-01-03');
  assert.equal(events.nextShower('2026-12-01', -30).id, 'GEM', 'Geminídeas (+33°) chegam a 27° em Porto Alegre');
  assert.equal(events.nextShower('2026-12-01', 2.8).radiantAltitude, 60, 'Boa Vista (hemisfério norte)');
  assert.equal(events.nextShower('2026-08-01', -30).id, 'ORI', 'Perseidas (+58°) quase não aparecem a 30°S');
  assert.equal(events.nextShower('2026-12-23', -3.1).night, '2027-01-03', 'virada do ano: Quadrântidas de 2027');
  assert.equal(events.nextShower('2027-10-01', -3.1).night, '2027-10-21');
  const computed = events.nextShower('2028-01-01', -3.1);
  assert.equal(computed.id, 'QUA');assert.equal(computed.night, '2028-01-03');assert.equal(computed.computed, true, 'depois da tabela, o pico vem da longitude solar');
  assert.equal(events.nextShower('2027-12-23', -3.1).night, '2028-01-03', 'virada para um ano sem tabela');
  assert.equal(events.nextShower('ontem', -3.1), null);
});

test('longitude solar reproduz o calendário IMO: no máximo uma noite de diferença, só em picos diurnos', () => {
  let same = 0;
  for (const shower of events.SHOWERS) {
    const peak = events.solarLongitudeTime(+shower.night.slice(0, 4), events.PEAKS[shower.id]);
    const night = new Date(peak - 15 * 3600000).toISOString().slice(0, 10);
    const days = Math.abs(Date.parse(night) - Date.parse(shower.night)) / 86400000;
    assert.ok(days <= 1, `${shower.id} ${shower.night}: ${night}`);
    if (days === 0) same++;
    else { const hour = (new Date(peak).getUTCHours() + 21) % 24; assert.ok(hour >= 7 && hour <= 18, `${shower.id}: diferença só com pico de dia no Brasil (${hour}h)`); }
  }
  assert.ok(same >= 15, `${same} de ${events.SHOWERS.length}`);
  const years = [2028, 2031, 2035].map(year => events.showersFor(year));
  for (const list of years) { assert.equal(list.length, 9); for (const shower of list) assert.match(shower.night, /^\d{4}-\d{2}-\d{2}$/); }
  // Datas habituais de cada chuva: anos futuros ficam a no máximo um dia delas.
  const usual = {QUA:'01-03', LYR:'04-22', ETA:'05-05', SDA:'07-30', PER:'08-12', ORI:'10-21', LEO:'11-17', GEM:'12-13', URS:'12-22'};
  for (const shower of events.showersFor(2031)) {
    const days = Math.abs(Date.parse(shower.night) - Date.parse(`2031-${usual[shower.id]}`)) / 86400000;
    assert.ok(days <= 1, `${shower.id} 2031: ${shower.night}`);
  }
});
