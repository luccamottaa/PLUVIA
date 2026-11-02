const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const load = () => import('../worker/pluvia.mjs');
const assets = (status = 200, type = 'text/javascript') => ({fetch: async () => new Response('x', {status, headers: {'Content-Type': type, 'Cache-Control': 'public, max-age=0, must-revalidate'}})});
const get = async (path, env = {ASSETS: assets()}) => (await load()).default.fetch(new Request(`https://pluviaweather.com.br${path}`), env);

test('arquivos com ?v= e fontes saem com cache de um ano; o resto fica como o Cloudflare manda', async () => {
  assert.equal((await get('/app.js?v=panel-149')).headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal((await get('/assets/fonts/nunito-wordmark-v32.woff2')).headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
  assert.equal((await get('/manifest.webmanifest')).headers.get('Cache-Control'), 'public, max-age=0, must-revalidate', 'sem versão: revalida');
  assert.equal((await get('/vendor/weathericons/Sun.svg')).headers.get('Cache-Control'), 'public, max-age=0, must-revalidate');
  assert.equal((await get('/sw.js')).headers.get('Cache-Control'), 'no-cache', 'o service worker nunca fica guardado');
  assert.equal((await get('/sw.js?v=1')).headers.get('Cache-Control'), 'no-cache');
  assert.equal((await get('/nada.js?v=1', {ASSETS: assets(404, 'text/html')})).headers.get('Cache-Control'), 'public, max-age=0, must-revalidate', '404 não fica um ano');
});

test('www vai para o domínio sem www mantendo caminho e query', async () => {
  const {default: worker} = await load();
  const response = await worker.fetch(new Request('https://www.pluviaweather.com.br/clima/manaus-am/?abrir=radar'), {ASSETS: {fetch: () => assert.fail('não consulta os arquivos')}});
  assert.equal(response.status, 301);
  assert.equal(response.headers.get('Location'), 'https://pluviaweather.com.br/clima/manaus-am/?abrir=radar');
});

test('HTML leva as pré-conexões do <head> (Early Hints) e toda resposta leva os cabeçalhos de segurança', async () => {
  const html = await get('/', {ASSETS: assets(200, 'text/html; charset=utf-8')});
  const head = fs.readFileSync('dist/index.html', 'utf8');
  for (const origin of [...head.matchAll(/<link rel="preconnect" href="([^"]+)"/g)].map(m => m[1])) assert.ok(html.headers.get('Link').includes(`<${origin}>`), origin);
  assert.equal((await get('/app.js?v=1')).headers.get('Link'), null);
  assert.equal(html.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(html.headers.get('Permissions-Policy'), /geolocation=\(self\)/);
  assert.match(html.headers.get('Permissions-Policy'), /microphone=\(self\)/, 'busca por voz');
});

test('wrangler publica dist/ pelo Worker, com 404 real e sem os arquivos só do GitHub Pages', () => {
  const config = fs.readFileSync('wrangler.jsonc', 'utf8');
  assert.match(config, /"main": "worker\/pluvia\.mjs"/);
  assert.match(config, /"directory": "\.\/dist"/);
  assert.match(config, /"not_found_handling": "404-page"/);
  assert.match(config, /"run_worker_first": true/);
  assert.deepEqual(fs.readFileSync('dist/.assetsignore', 'utf8').trim().split('\n'), ['CNAME', '.nojekyll', 'dev-server.cjs']);
});
