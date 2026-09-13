const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const icons = require('../dist/modules/weather-icons.js');

test('mapeia códigos WMO e respeita variantes de dia e noite', () => {
  assert.equal(icons.assetFor(0, true), 'Sun.svg');
  assert.equal(icons.assetFor(0, false), 'Moon.svg');
  assert.equal(icons.assetFor(2, true), 'PartlySunny.svg');
  assert.equal(icons.assetFor(2, false), 'PartlyMoon.svg');
  assert.equal(icons.assetFor(45, true), 'Haze.svg');
  assert.equal(icons.assetFor(65, true), 'Rain.svg');
  assert.equal(icons.assetFor(96, true), 'Hail.svg');
});

test('usa nascer e pôr do sol reais para cada frame horário', () => {
  assert.equal(icons.isDayAt('2026-09-13T05:59', '2026-09-13T06:00', '2026-09-13T18:00'), false);
  assert.equal(icons.isDayAt('2026-09-13T12:00', '2026-09-13T06:00', '2026-09-13T18:00'), true);
  assert.equal(icons.isDayAt('2026-09-13T18:00', '2026-09-13T06:00', '2026-09-13T18:00'), false);
});

test('mantém os SVGs oficiais e a licença no bundle offline', () => {
  const root = path.join(__dirname, '..', 'dist', 'vendor', 'weathericons');
  for (const asset of ['Sun.svg','Moon.svg','PartlySunny.svg','PartlyMoon.svg','Cloud.svg','Haze.svg','Rain.svg','Snow.svg','Storm.svg','Hail.svg']) {
    assert.ok(fs.existsSync(path.join(root, asset)), `${asset} ausente`);
  }
  assert.match(fs.readFileSync(path.join(root, 'LICENSE.txt'), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
});
