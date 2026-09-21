const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createClient} = require('../dist/modules/http-client.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'dist', 'app.js'), 'utf8');

function abortedFetch(_url, {signal}) {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {once:true});
  });
}

test('cancelamento por troca de cidade não é tratado nem repetido como timeout', async () => {
  const client = createClient({fetchImpl:abortedFetch});
  const request = client.getJson('https://example.test/weather', {timeoutMs:1000});
  assert.equal(client.pendingCount(), 1);
  client.abortAll();
  await assert.rejects(request, error => error.code === 'cancelled' && error.retryable === false);
  assert.equal(client.pendingCount(), 0);
});

test('timeout, rate limit e JSON inválido têm códigos operacionais distintos', async () => {
  const timeoutClient = createClient({fetchImpl:abortedFetch});
  await assert.rejects(
    timeoutClient.getJson('https://example.test/weather', {timeoutMs:5}),
    error => error.code === 'timeout' && error.retryable === true
  );

  const rateClient = createClient({fetchImpl:async () => ({ok:false, status:429})});
  await assert.rejects(
    rateClient.getJson('https://example.test/weather'),
    error => error.code === 'rate_limited' && error.status === 429 && error.retryable === true
  );

  const invalidClient = createClient({fetchImpl:async () => ({ok:true, status:200, json:async () => { throw new SyntaxError('bad json'); }})});
  await assert.rejects(
    invalidClient.getJson('https://example.test/weather'),
    error => error.code === 'invalid_response' && error.retryable === true
  );
});

test('sucesso limpa o registro e preserva zero e falso recebidos no JSON', async () => {
  const payload = {temperature:0,isDay:false};
  const client = createClient({fetchImpl:async () => ({ok:true,status:200,json:async () => payload})});
  assert.deepEqual(await client.getJson('https://example.test/weather'), payload);
  assert.equal(client.pendingCount(), 0);
});

test('tendência de pressão exige três horas reais de histórico', () => {
  assert.match(app, /const pressurePast = start >= 3 \? data\.hourly\.pressure_msl\?\.\[start - 3\] : null/);
  assert.doesNotMatch(app, /pressure_msl\?\.\[Math\.max\(0,start - 3\)\]/);
});
