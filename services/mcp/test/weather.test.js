import test from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentWeather, getRainForecast } from '../src/weather.js';

test('rejects latitude outside Earth bounds before network access', async () => {
  await assert.rejects(() => getCurrentWeather({ latitude: 91, longitude: 0 }), /Latitude inválida/);
});

test('rejects longitude outside Earth bounds before network access', async () => {
  await assert.rejects(() => getRainForecast({ latitude: 0, longitude: 181 }), /Longitude inválida/);
});
