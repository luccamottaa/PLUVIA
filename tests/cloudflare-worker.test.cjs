const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const load = () => import('../worker/pluvia.mjs');
const assets = (status = 200, type = 'text/javascript') => ({fetch: async () => new Response('x', {status, headers: {'Content-Type': type, 'Cache-Control': 'public, max-age=0, must-revalidate'}})});
const get = async (path, env = {ASSETS: assets()}) => (await load()).default.fetch(new Request(`https://pluviaweather.com.br${path}`), env);

test('arquivos com ?v= e fontes saem com cache de um ano; o resto fica como o Cloudflare manda', async () => {
  assert.equal((await get('/app.js?v=panel-155')).headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
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
  // Worker Previews (npx wrangler preview, o comando dos builds de PR) exige o bloco "previews", mesmo vazio.
  assert.match(config, /"previews": \{\}/);
  assert.deepEqual(fs.readFileSync('dist/.assetsignore', 'utf8').trim().split('\n'), ['CNAME', '.nojekyll', 'dev-server.cjs']);
});

// Pôr do sol de hoje no Google (novembro/2026). Sem o HTMLRewriter do Cloudflare no Node, um substituto mínimo faz o
// mesmo papel (troca o conteúdo do <title> e o atributo content da meta description).
class FakeRewriter {
  constructor() { this.handlers = []; }
  on(selector, handler) { this.handlers.push([selector, handler]); return this; }
  transform(response) {
    const handlers = this.handlers;
    const body = response.text().then(html => {
      for (const [selector, handler] of handlers) {
        if (selector === 'title') html = html.replace(/<title>[^<]*<\/title>/, () => { let inner = ''; handler.element({setInnerContent: v => { inner = v; }}); return `<title>${inner}</title>`; });
        if (selector === 'meta[name="description"]') html = html.replace(/<meta name="description" content="[^"]*" \/>/, () => { let value = ''; handler.element({setAttribute: (_, v) => { value = v; }}); return `<meta name="description" content="${value}" />`; });
      }
      return html;
    });
    return new Response(new ReadableStream({async start(controller) { controller.enqueue(new TextEncoder().encode(await body)); controller.close(); }}), response);
  }
}
const page = fs.readFileSync('dist/clima/manaus-am/index.html', 'utf8');
function htmlAssets(seen = []) {
  return {fetch: async request => {
    seen.push(request.headers.get('If-None-Match'));
    return new Response(page, {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8', ETag: '"abc123"', 'Last-Modified': 'Thu, 12 Nov 2026 10:00:00 GMT', 'Cache-Control': 'public, max-age=0, must-revalidate'}});
  }};
}

test('pôr do sol de hoje no fuso da cidade: mesmo cálculo do app, conferido com o Open-Meteo', async () => {
  const {sunTexts} = await load();
  // 13/11/2026 em Manaus: Open-Meteo dá nascer 05:36 e pôr 17:52.
  const manaus = sunTexts('manaus-am', Date.parse('2026-11-13T15:00:00Z'));
  assert.equal(manaus.title, 'Pôr do sol hoje em Manaus: 17:52 · Clima e previsão — PLUVIA');
  assert.match(manaus.description, /^Pôr do sol hoje em Manaus \(AM\) às 17:52 e nascer do sol às 05:36\./);
  // "Hoje" é o dia municipal: 23:30 em Manaus ainda é 13/11; 00:10 já é 14/11.
  assert.equal(sunTexts('manaus-am', Date.parse('2026-11-14T03:30:00Z')).day, '2026-11-13');
  assert.equal(sunTexts('manaus-am', Date.parse('2026-11-14T04:10:00Z')).day, '2026-11-14');
  // Horário de verão: em 20/11/2018 São Paulo estava em UTC−2; o mesmo pôr do sol sai uma hora mais tarde no relógio.
  assert.match(sunTexts('sao-paulo-sp', Date.parse('2018-11-20T15:00:00Z')).title, /: 19:32 ·/);
  assert.match(sunTexts('sao-paulo-sp', Date.parse('2026-11-20T15:00:00Z')).title, /: 18:32 ·/);
  assert.equal(sunTexts('cidade-que-nao-existe-xx'), null);
});

test('/clima/<cidade>/ reescreve só título e descrição; 304 só com a etiqueta do dia', async () => {
  const {default: worker, sunTexts} = await load();
  globalThis.HTMLRewriter = FakeRewriter;
  try {
    const seen = [];
    const response = await worker.fetch(new Request('https://pluviaweather.com.br/clima/manaus-am/', {headers: {'If-None-Match': '"abc123"'}}), {ASSETS: htmlAssets(seen)});
    assert.equal(seen[0], null, 'o pedido aos arquivos vai sem condicional');
    assert.equal(response.status, 200, 'a etiqueta antiga (sem o dia) não vale');
    const html = await response.text(), texts = sunTexts('manaus-am');
    assert.match(html, new RegExp(`<title>${texts.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</title>`));
    assert.ok(html.includes(`<meta name="description" content="${texts.description}" />`));
    // O resto do HTML é o mesmo da página estática.
    const strip = text => text.replace(/<title>[^<]*<\/title>/, '').replace(/<meta name="description" content="[^"]*" \/>/, '');
    assert.equal(strip(html), strip(page));
    const tag = response.headers.get('ETag');
    assert.equal(tag, `W/"abc123-${texts.day}"`);
    assert.equal(response.headers.get('Last-Modified'), null);
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=0, must-revalidate', 'o cache do HTML continua o mesmo');
    assert.ok(response.headers.get('Link'), 'pré-conexões continuam');
    const again = await worker.fetch(new Request('https://pluviaweather.com.br/clima/manaus-am/', {headers: {'If-None-Match': tag}}), {ASSETS: htmlAssets()});
    assert.equal(again.status, 304);
    assert.equal(again.headers.get('ETag'), tag);
    // Fora de /clima/<cidade>/ e cidade desconhecida: nada muda.
    const home = await worker.fetch(new Request('https://pluviaweather.com.br/'), {ASSETS: htmlAssets()});
    assert.ok((await home.text()).includes('<title>Clima em Manaus (AM) hoje'));
    const unknown = await worker.fetch(new Request('https://pluviaweather.com.br/clima/nao-existe-xx/'), {ASSETS: htmlAssets()});
    assert.equal(unknown.headers.get('ETag'), '"abc123"');
  } finally { delete globalThis.HTMLRewriter; }
});

test('mapa de cidades do Worker em dia com as páginas', () => {
  const {build, workerCities} = require('../scripts/generate-city-pages.cjs');
  assert.equal(fs.readFileSync('worker/city-pages.mjs', 'utf8'), workerCities(build().api));
});
