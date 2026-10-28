const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

test('Cloudflare Pages: 404 próprio (sem cair no index.html) e sw.js sem cache', () => {
  const page = fs.readFileSync('dist/404.html', 'utf8');
  assert.match(page, /<meta name="robots" content="noindex" \/>/);
  assert.match(page, /href="\/"/);
  assert.match(fs.readFileSync('dist/_headers', 'utf8'), /^\/sw\.js\n  Cache-Control: no-cache\n/);
});

test('o shell redirecionado (/index.html → / no Pages) é guardado como resposta comum', async () => {
  const source = fs.readFileSync('dist/sw.js', 'utf8');
  const puts = [], listeners = {};
  const cache = {
    put: async (key, res) => { puts.push({key:String(key), res}); },
    addAll: async requests => { for (const r of requests) puts.push({key:r.url, res:null}); },
    add: async () => {}
  };
  class FakeResponse {
    constructor(body, init = {}) { this.body = body; this.status = init.status ?? 200; this.statusText = init.statusText ?? ''; this.headers = init.headers ?? {}; this.ok = this.status >= 200 && this.status < 300; this.redirected = false; }
    async blob() { return this.body; }
  }
  const redirected = Object.assign(new FakeResponse('<html>shell</html>'), {redirected:true});
  const context = {
    self: {location:{href:'https://pluviaweather.com.br/sw.js'}, addEventListener:(t, f) => { listeners[t] = f; }, skipWaiting: async () => {}},
    caches: {open: async () => cache},
    Request: class { constructor(url, init) { this.url = String(url); this.init = init; } },
    Response: FakeResponse, URL,
    fetch: async request => (request.url.endsWith('/index.html') ? redirected : new FakeResponse('x')),
    importScripts: () => {}, location: {origin:'https://pluviaweather.com.br'}, console
  };
  context.addEventListener = context.self.addEventListener;
  vm.runInNewContext(source, context);
  let done;
  listeners.install({waitUntil: promise => { done = promise; }});
  await done;
  const shell = puts.find(entry => entry.key === 'https://pluviaweather.com.br/index.html' && entry.res);
  assert.ok(shell, 'shell guardado à parte');
  assert.equal(shell.res.redirected, false);
  assert.equal(shell.res.body, '<html>shell</html>');
  assert.equal(puts.filter(entry => entry.key.endsWith('/index.html')).length, 1, 'o shell não entra de novo no addAll');
});
