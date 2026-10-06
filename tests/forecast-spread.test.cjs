const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const spread = require('../dist/modules/forecast-spread.js');

function ensemble(days, members, value = (day, member) => 28 + day + member / 10) {
  const daily = {time: Array.from({length: days}, (_, day) => `2026-10-${String(6 + day).padStart(2, '0')}`)};
  for (let member = 0; member < members; member += 1) {
    const suffix = member === 0 ? '' : `_member${String(member).padStart(2, '0')}`;
    daily[`temperature_2m_max${suffix}`] = daily.time.map((_, day) => value(day, member));
    daily[`temperature_2m_min${suffix}`] = daily.time.map((_, day) => { const max = value(day, member); return max === null ? null : max - 10; });
  }
  return {daily};
}

test('percentis 10–90 por dia municipal, com controle e membros', () => {
  const result = spread.summarize(ensemble(2, 41));
  assert.equal(result.members, 41);
  assert.deepEqual(result.days['2026-10-06'].max, {low: 28.4, high: 31.6, members: 41});
  assert.deepEqual(result.days['2026-10-07'].min, {low: 19.4, high: 22.6, members: 41});
  assert.equal(spread.describe(result.days['2026-10-06']), 'Faixa provável entre os cenários do conjunto ICON: máxima 28° a 32°, mínima 18° a 22°.');
});

test('membros ausentes não viram zero e dias com poucos membros ficam sem faixa', () => {
  const sparse = ensemble(2, 41, (day, member) => day === 1 && member >= 15 ? null : 30);
  const result = spread.summarize(sparse);
  assert.deepEqual(result.days['2026-10-06'].max, {low: 30, high: 30, members: 41});
  assert.equal(result.days['2026-10-07'], undefined);
  assert.equal(spread.describe(result.days['2026-10-06']), 'Faixa provável entre os cenários do conjunto ICON: máxima 30°, mínima 20°.');
  assert.equal(spread.summarize(ensemble(1, 19)), null);
  assert.equal(spread.summarize({daily: {time: ['ontem']}}), null);
  assert.equal(spread.summarize(null), null);
  assert.equal(spread.describe(null), '');
});

function runtime() {
  const listeners = {}, docListeners = {}, requests = [];
  let aborts = 0;
  const context = {
    URL, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
    dispatchEvent: event => (listeners[event.type] || []).forEach(fn => fn(event)),
    document: {addEventListener: (type, fn) => (docListeners[type] ||= []).push(fn)},
    PLUVIA: {
      http: {createClient: () => ({abortAll: () => { aborts += 1; requests.filter(r => !r.settled).forEach(r => r.reject(Object.assign(new Error('Consulta cancelada.'), {code: 'cancelled'}))); }})},
      services: {createServices: () => ({ensemble: {getDaily: city => new Promise((resolve, reject) => {
        const request = {city, settled: false};
        request.resolve = value => { request.settled = true; resolve(value); };
        request.reject = error => { request.settled = true; reject(error); };
        requests.push(request);
      })}})}
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext('let activeCity = {id: "1302603", name: "Manaus", timezone: "America/Manaus"};', context);
  vm.runInContext(fs.readFileSync('dist/modules/forecast-spread.js', 'utf8'), context);
  const day = {closest: selector => selector === '#forecastList' ? {} : selector === '[data-day-index]' ? day : null};
  return {
    context, requests, get aborts() { return aborts; },
    click: () => docListeners.click.forEach(fn => fn({target: day})),
    setCity: id => { vm.runInContext(`activeCity = {id: ${JSON.stringify(id)}, name: "X", timezone: "America/Sao_Paulo"}`, context); context.dispatchEvent(new context.CustomEvent('pluvia:city-changed', {detail: {id}})); },
    on: (type, fn) => context.addEventListener(type, fn)
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('consulta só ao abrir um dia, reaproveita cache e avisa o detalhe', async () => {
  const app = runtime(), events = [];
  app.on('pluvia:forecast-spread', event => events.push(event.detail.cityId));
  assert.equal(app.requests.length, 0, 'abrir a Home não consulta o conjunto');
  app.click(); app.click();
  assert.equal(app.requests.length, 1, 'cliques simultâneos compartilham a consulta');
  app.requests[0].resolve(ensemble(7, 41));
  await flush();
  assert.deepEqual(events, ['1302603']);
  assert.equal(app.context.PLUVIA.forecastSpread.peek('1302603').members, 41);
  app.click();
  assert.equal(app.requests.length, 1, 'faixa recente vem do cache');
  assert.equal(app.context.PLUVIA.forecastSpread.peek('1302603', Date.now() + 3 * 3600000 + 1), null, 'faixa expira');
});

test('troca de cidade cancela a consulta e resposta antiga não preenche a cidade nova', async () => {
  const app = runtime(), events = [];
  app.on('pluvia:forecast-spread', event => events.push(event.detail.cityId));
  app.click();
  const stale = app.requests[0];
  app.setCity('3550308');
  assert.equal(app.aborts, 1);
  stale.resolve(ensemble(7, 41));
  await flush();
  assert.deepEqual(events, []);
  assert.equal(app.context.PLUVIA.forecastSpread.peek('1302603'), null);
  // A → B → A: a cidade original consulta de novo, pois a resposta cancelada não foi guardada.
  app.setCity('1302603');
  app.click();
  assert.equal(app.requests.length, 2);
});

test('falha fica em espera curta; cancelamento não é falha nem repetição automática', async () => {
  const app = runtime();
  app.click();
  app.requests[0].reject(Object.assign(new Error('timeout'), {code: 'timeout'}));
  await flush();
  app.click();
  assert.equal(app.requests.length, 1, 'não repete a fonte indisponível imediatamente');
  assert.equal(app.context.PLUVIA.forecastSpread.peek('1302603'), null);
  app.context.PLUVIA.forecastSpread.load({id: '1302603'}, Date.now() + 5 * 60000 + 1);
  assert.equal(app.requests.length, 2, 'após a espera curta, nova abertura consulta outra vez');
});
