const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const icons = require('../dist/modules/weather-icon-system.js');

test('mapeia códigos WMO e respeita variantes de dia e noite', () => {
  assert.equal(icons.assetFor(0, true), 'clear-day.svg');
  assert.equal(icons.assetFor(0, false), 'clear-night.svg');
  assert.equal(icons.assetFor(1, true), 'partly-cloudy-day.svg');
  assert.equal(icons.assetFor(1, false), 'partly-cloudy-night.svg');
  assert.equal(icons.icon(1, true).source, 'pluvia-vector');
  assert.equal(icons.assetFor(2, true), 'partly-cloudy-day.svg');
  assert.equal(icons.assetFor(2, false), 'partly-cloudy-night.svg');
  assert.equal(icons.assetFor(45, true), 'fog.svg');
  assert.equal(icons.assetFor(65, true), 'heavy-rain.svg');
  assert.equal(icons.assetFor(96, true), 'thunderstorm-hail.svg');
  assert.equal(icons.assetFor(80, true), 'showers.svg');
  assert.equal(icons.assetFor(80, false), 'showers-night.svg');
  assert.equal(icons.assetFor(81, false), 'showers-night.svg');
  assert.equal(icons.assetFor(82, false), 'heavy-rain.svg');
});

test('centraliza ícones nomeados e usa fallback local sem gerar 404', () => {
  assert.equal(icons.namedIcon('humidity').src, './assets/weather-icons/metrics/humidity.png');
  assert.equal(icons.namedIcon('rain-probability').source, 'pluvia-glossy');
  assert.equal(icons.namedIcon('radar').source, 'weathericons-fallback');
  assert.equal(icons.namedIcon('radar').src, './vendor/weathericons/Cloud.svg');
});

test('ícones de condições em SVG e métricas em PNG existem e são válidos', () => {
  for (const [category, entries] of Object.entries(icons.ASSETS)) {
    for (const file of Object.values(entries)) {
      const asset = path.join(__dirname, '..', 'dist', 'assets', 'weather-icons', category, file);
      assert.ok(fs.existsSync(asset), `${category}/${file} ausente`);
      const contents = fs.readFileSync(asset);
      if (file.endsWith('.svg')) {
        assert.match(contents.toString(), /<svg[^>]*viewBox="0 0 128 128"[\s\S]*<\/svg>/, `${category}/${file} parece inválido`);
      } else {
        assert.ok(contents.length > 10_000, `${category}/${file} parece inválido`);
      }
    }
  }
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
