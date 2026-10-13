const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../dist/modules/captcha.js'), 'utf8');

function element(tag, doc) {
  const el = {
    tagName: tag.toUpperCase(), children: [], dataset: {}, attrs: {}, parent: null, className: '', textContent: '',
    setAttribute(k, v) { this.attrs[k] = String(v); },
    append(...nodes) { nodes.forEach(n => this.appendChild(n)); },
    appendChild(n) { n.parent = this; this.children.push(n); if (n.tagName === 'SCRIPT') doc.scripts.push(n); return n; },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; },
    get isConnected() { let n = this; while (n.parent) n = n.parent; return n === doc.body || n === doc.head; },
    querySelector(sel) { return sel === '.dialog-scroll' ? this.scroll || null : null; },
    scrollIntoView() {},
  };
  return el;
}

function setup({withTurnstile = true} = {}) {
  const doc = {scripts: [], dialogs: []};
  doc.head = element('head', doc); doc.body = element('body', doc);
  doc.createElement = tag => element(tag, doc);
  doc.querySelectorAll = sel => sel === 'dialog[open]' ? doc.dialogs.filter(d => d.open) : [];
  const calls = [];
  const widgets = new Map();
  let next = 0;
  const turnstile = {
    mode: 'pass',
    render(slot, options) { const id = `w${next++}`; widgets.set(id, {slot, options}); calls.push(['render', id, options.sitekey, options.appearance, options.execution]); return id; },
    reset(id) { calls.push(['reset', id]); },
    remove(id) { calls.push(['remove', id]); widgets.delete(id); },
    execute(id) {
      calls.push(['execute', id]);
      const {options} = widgets.get(id);
      queueMicrotask(() => {
        if (turnstile.mode === 'pass') options.callback(`token-${calls.length}`);
        else if (turnstile.mode === 'error') options['error-callback']('300030');
        else if (turnstile.mode === 'interactive') options['before-interactive-callback']();
      });
    },
  };
  const timers = [];
  const runtime = {
    document: doc,
    setTimeout(fn, ms) { const t = {fn, ms}; timers.push(t); return t; },
    clearTimeout(t) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
  };
  if (withTurnstile) runtime.turnstile = turnstile;
  runtime.globalThis = runtime;
  const context = vm.createContext({globalThis: runtime, queueMicrotask, Promise, Error});
  const sandboxModule = {exports: {}};
  vm.runInContext(`(function(module){${source}\n})`, context)(sandboxModule);
  return {api: sandboxModule.exports, doc, calls, turnstile, timers, runtime};
}

test('o sitekey é a chave pública do Turnstile, nunca uma chave secreta', () => {
  const {api} = setup();
  assert.match(api.SITEKEY, /^0x4[A-Za-z0-9_-]{10,}$/);
  assert.doesNotMatch(api.SITEKEY, /PENDENTE/, 'sitekey real do painel do Cloudflare');
});

test('cada pedido gera um token novo: render uma vez, depois reset + execute', async () => {
  const {api, calls} = setup();
  const first = await api.token();
  const second = await api.token();
  assert.notEqual(first, second);
  assert.deepEqual(calls.map(c => c[0]), ['render', 'execute', 'reset', 'execute']);
  assert.equal(calls[0][3], 'interaction-only');
  assert.equal(calls[0][4], 'execute');
});

test('a caixinha mora na janela aberta (modal deixa o resto inerte) e é refeita ao trocar de janela', async () => {
  const {api, doc, calls} = setup();
  const scroll = element('div', doc);
  const dialog = Object.assign(element('dialog', doc), {open: true, scroll});
  dialog.appendChild(scroll); doc.body.appendChild(dialog); doc.dialogs.push(dialog);
  await api.token();
  assert.equal(scroll.children.length, 1);
  assert.equal(scroll.children[0].className, 'captcha-box');
  assert.equal(scroll.children[0].dataset.state, 'idle');
  dialog.open = false;
  await api.token();
  assert.equal(scroll.children.length, 0, 'a caixa antiga sai da janela fechada');
  assert.equal(doc.body.children.filter(c => c.className === 'captcha-box').length, 1);
  assert.ok(calls.some(c => c[0] === 'remove'));
});

test('erro do widget rejeita com captcha_failed e a mensagem é em português', async () => {
  const {api, turnstile} = setup();
  turnstile.mode = 'error';
  await assert.rejects(api.token(), err => err.code === 'captcha_failed' && api.isCaptchaError(err));
  assert.match(api.message({code: 'captcha_failed'}), /verificação de segurança falhou/);
  assert.match(api.message({code: 'captcha_unavailable'}), /carregar a verificação/);
  assert.equal(api.isCaptchaError({code: 'invalid_credentials'}), false);
});

test('interação pedida mostra a frase; sem resposta, o prazo vira captcha_timeout', async () => {
  const {api, doc, turnstile, timers} = setup();
  turnstile.mode = 'interactive';
  const pending = api.token();
  await new Promise(resolve => setImmediate(resolve));
  const box = doc.body.children.find(c => c.className === 'captcha-box');
  assert.equal(box.dataset.state, 'interactive');
  const timeout = timers.find(t => t.ms === 90000);
  timeout.fn();
  await assert.rejects(pending, err => err.code === 'captcha_timeout');
  assert.equal(box.dataset.state, 'idle');
});

test('o script do Cloudflare só é baixado sob demanda e uma falha libera nova tentativa', async () => {
  const {api, doc, runtime} = setup({withTurnstile: false});
  const first = api.load();
  assert.equal(doc.scripts.length, 1);
  assert.match(doc.scripts[0].src, /^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit$/);
  assert.equal(api.load(), first, 'pedidos simultâneos compartilham o mesmo script');
  doc.scripts[0].onerror();
  await assert.rejects(first, err => err.code === 'captcha_unavailable');
  const second = api.load();
  assert.equal(doc.scripts.length, 2);
  runtime.turnstile = {};
  doc.scripts[1].onload();
  assert.equal(await second, runtime.turnstile);
});

test('o app manda o token em todos os fluxos que o Supabase protege', () => {
  const account = fs.readFileSync(path.join(__dirname, '../dist/account.js'), 'utf8');
  for (const call of ['resetPasswordForEmail', 'signUp', 'signInWithPassword', 'signInAnonymously']) {
    const at = account.indexOf(`client.auth.${call}(`);
    assert.ok(at > 0, call);
    const end = account.indexOf(';', at);
    assert.match(account.slice(at, end), /captchaToken/, `${call} leva captchaToken`);
  }
  assert.doesNotMatch(account, /const \[client,\s*getCaptchaToken\]/);
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  assert.ok(html.indexOf('modules/captcha.js') > 0 && html.indexOf('modules/captcha.js') < html.indexOf('account.js?v='), 'captcha.js antes de account.js');
  assert.doesNotMatch(html, /challenges\.cloudflare\.com/, 'nada do Turnstile na abertura');
});
