const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');
const requestLayer = app.slice(0, app.indexOf('async function fetchForecast'));

function contextWith(fetch) {
  const context = vm.createContext({fetch, URL, AbortController, setTimeout, clearTimeout});
  vm.runInContext(requestLayer, context);
  return context;
}

function abortedFetch(_url, {signal}) {
  return new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once:true});
  });
}

test('cancelamento por troca de cidade não é tratado nem repetido como timeout', async () => {
  const context = contextWith(abortedFetch);
  const request = vm.runInContext('fetchJson("https://example.test/weather", 1000)', context);
  vm.runInContext('pendingRequests.forEach(controller => controller.abort())', context);
  await assert.rejects(request, error => error.code === 'cancelled' && error.retryable === false);
});

test('timeout, rate limit e JSON inválido têm códigos operacionais distintos', async () => {
  const timeoutContext = contextWith(abortedFetch);
  await assert.rejects(
    vm.runInContext('fetchJson("https://example.test/weather", 5)', timeoutContext),
    error => error.code === 'timeout' && error.retryable === true
  );

  const rateContext = contextWith(async () => ({ok:false, status:429}));
  await assert.rejects(
    vm.runInContext('fetchJson("https://example.test/weather")', rateContext),
    error => error.code === 'rate_limited' && error.status === 429 && error.retryable === true
  );

  const invalidContext = contextWith(async () => ({ok:true, status:200, json:async () => { throw new SyntaxError('bad json'); }}));
  await assert.rejects(
    vm.runInContext('fetchJson("https://example.test/weather")', invalidContext),
    error => error.code === 'invalid_response' && error.retryable === true
  );
});

test('tendência de pressão exige três horas reais de histórico', () => {
  assert.match(app, /const pressurePast = start >= 3 \? data\.hourly\.pressure_msl\?\.\[start - 3\] : null/);
  assert.doesNotMatch(app, /pressure_msl\?\.\[Math\.max\(0,start - 3\)\]/);
});
