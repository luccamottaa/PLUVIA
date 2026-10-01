const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const p0 = fs.readFileSync('dist/p0.js', 'utf8');
const update = p0.slice(p0.indexOf('if ("serviceWorker" in navigator'), p0.indexOf('(function setupDialogViewport()'));
const settle = () => new Promise(resolve => setImmediate(resolve));

function boot(controlled = true) {
  const events = {}, documentEvents = {}, workerEvents = {};
  let now = 0, checks = 0, reloads = 0, options;
  const registration = { update: async () => { checks++; } };
  const context = {
    document: { visibilityState: 'visible', addEventListener: (name, fn) => { documentEvents[name] = fn; } },
    window: { isSecureContext: true, addEventListener: (name, fn) => { events[name] = fn; } },
    navigator: { onLine: true, serviceWorker: {
      controller: controlled ? {} : null,
      addEventListener: (name, fn) => { workerEvents[name] = fn; },
      register: async (_, config) => { options = config; return registration; }
    } },
    location: { reload: () => { reloads++; } },
    Date: { now: () => now },
    setInterval: fn => { events.interval = fn; }
  };
  vm.runInNewContext(update, context);
  return { context, events, documentEvents, workerEvents, registration,
    advance: ms => { now += ms; }, checks: () => checks, reloads: () => reloads, options: () => options };
}

test('PWA verifica versões ao retornar do segundo plano sem esperar outro load', async () => {
  const app = boot();
  await settle();
  assert.equal(app.checks(), 1);
  assert.equal(app.options().updateViaCache, 'none');
  app.events.focus();
  app.events.pageshow();
  await settle();
  assert.equal(app.checks(), 1, 'eventos de retomada próximos não duplicam a consulta');
  app.advance(31000);
  app.context.document.visibilityState = 'hidden';
  app.documentEvents.visibilitychange();
  await settle();
  assert.equal(app.checks(), 1);
  app.context.document.visibilityState = 'visible';
  app.documentEvents.visibilitychange();
  await settle();
  assert.equal(app.checks(), 2);
  app.workerEvents.controllerchange();
  app.workerEvents.controllerchange();
  assert.equal(app.reloads(), 1, 'aplica o novo documento uma única vez');
});

test('primeira instalação não recarrega; offline e falhas de atualização permitem nova tentativa', async () => {
  const app = boot(false);
  await settle();
  app.workerEvents.controllerchange();
  assert.equal(app.reloads(), 0);
  app.advance(31000);
  app.context.navigator.onLine = false;
  app.events.interval();
  await settle();
  assert.equal(app.checks(), 1);
  app.context.navigator.onLine = true;
  app.registration.update = async () => { throw new Error('offline'); };
  app.events.online();
  await settle();
  let retried = false;
  app.registration.update = async () => { retried = true; };
  app.events.focus();
  await settle();
  assert.equal(retried, true);
});

test('versão nova aguarda a busca ou formulário fechar para não apagar a digitação',async()=>{
  const app=boot();await settle();
  let interacting=true;
  app.context.document.querySelector=()=>interacting ? {} : null;
  app.workerEvents.controllerchange();assert.equal(app.reloads(),0);
  interacting=false;app.documentEvents.close();assert.equal(app.reloads(),1);
  app.workerEvents.controllerchange();assert.equal(app.reloads(),1);
});

function worker(failCritical = false) {
  const events = {}, requests = [];
  let skipped = false;
  const cache = {
    addAll: async items => {
      requests.push(...items);
      if (failCritical) throw new Error('CSS unavailable');
    },
    add: async item => {
      requests.push(item);
      if (item.url.includes('logo-mark.png')) throw new Error('image unavailable');
    }
  };
  vm.runInNewContext(fs.readFileSync('dist/sw.js', 'utf8'), {
    self: { location: { href: 'https://pluviaweather.com.br/sw.js' },
      addEventListener: (name, fn) => { events[name] = fn; },
      skipWaiting: async () => { skipped = true; }
    },
    caches: { open: async () => cache }, Request, URL
  });
  let installing;
  events.install({ waitUntil: promise => { installing = promise; } });
  return { installing, requests, skipped: () => skipped };
}

test('atualização completa ativa mesmo se um ícone falha, mas não se faltar CSS essencial', async () => {
  const success = worker();
  await success.installing;
  assert.equal(success.skipped(), true);
  assert.ok(success.requests.length > 20);
  assert.ok(success.requests.every(request => request.cache === 'reload'));
  const failed = worker(true);
  await assert.rejects(failed.installing, /CSS unavailable/);
  assert.equal(failed.skipped(), false);
});

test('estilos que definem mapa claro e previsão contínua carregam como estilos de tela', () => {
  const html = fs.readFileSync('dist/index.html', 'utf8');
  for (const name of ['redesign', 'continuous']) {
    const link = html.match(new RegExp(`<link[^>]+href="\\./${name}\\.css[^>]+>`))?.[0];
    assert.ok(link);
    assert.doesNotMatch(link, /media="print"/);
  }
});
