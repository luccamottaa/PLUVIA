/* Cloudflare Turnstile para o Supabase Auth (pedido do usuário, outubro/2026). O CAPTCHA está ligado no
   projeto Supabase, que confere o token no servidor (siteverify com a chave secreta guardada lá): o app só
   obtém um token e o entrega em options.captchaToken em signUp, signInWithPassword,
   resetPasswordForEmail e signInAnonymously. Google/Apple (OAuth) não usam.
   - O script do Turnstile só é baixado quando um desses fluxos começa (nada na abertura do app).
   - Modo "interaction-only": quase sempre invisível; se o Cloudflare pedir uma interação, a caixinha
     aparece dentro da janela aberta (uma <dialog> modal deixa o resto da página inerte) ou, sem janela,
     num cartão fixo embaixo. O contêiner nunca fica display:none: o próprio Turnstile decide quando
     mostrar o iframe; só a frase de explicação depende de data-state="interactive".
   - Cada token vale uma vez: cada pedido faz reset + execute e espera um token novo. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).captcha = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (runtime) {
  'use strict';
  const SITEKEY = '0x4AAAAAAFWEHBm1Kqy0jUaX';
  const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  const TIMEOUT_MS = 90000;
  let scriptPromise = null, widget = null, pending = null;

  function error(code) { const e = new Error(code); e.code = code; return e; }

  function load(doc = runtime.document) {
    if (runtime.turnstile) return Promise.resolve(runtime.turnstile);
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const script = doc.createElement('script');
      const fail = () => { scriptPromise = null; script.remove?.(); reject(error('captcha_unavailable')); };
      const timer = runtime.setTimeout(fail, 15000);
      script.src = SCRIPT; script.async = true; script.defer = true;
      script.onload = () => { runtime.clearTimeout(timer); runtime.turnstile ? resolve(runtime.turnstile) : fail(); };
      script.onerror = () => { runtime.clearTimeout(timer); fail(); };
      doc.head.appendChild(script);
    });
    return scriptPromise;
  }

  // A caixinha mora na janela modal aberta mais recente (fora dela o toque não chega) ou no fim do body.
  function hostFor(doc) {
    const open = [...doc.querySelectorAll('dialog[open]')];
    const dialog = open[open.length - 1];
    return dialog?.querySelector?.('.dialog-scroll') || dialog || doc.body;
  }
  function box(doc, host) {
    const el = doc.createElement('div');
    el.className = 'captcha-box'; el.dataset.state = 'idle';
    el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Verificação de segurança');
    const note = doc.createElement('p'); note.textContent = 'Confirme que você é uma pessoa para continuar.';
    const slot = doc.createElement('div');
    el.append(note, slot); host.appendChild(el);
    return {el, slot};
  }
  function settle(fn, value) {
    if (!pending) return;
    const {timer} = pending, done = pending[fn];
    pending = null; runtime.clearTimeout(timer);
    if (widget) widget.el.dataset.state = 'idle';
    done(value);
  }

  // Um token novo por chamada. Rejeita com captcha_unavailable (script não carregou), captcha_failed
  // (erro do widget) ou captcha_timeout; quem chama mostra a mensagem do erro.
  async function token({doc = runtime.document, action = 'auth'} = {}) {
    const turnstile = await load(doc);
    const host = hostFor(doc);
    if (widget && (widget.host !== host || widget.el.isConnected === false)) { try { turnstile.remove(widget.id); } catch {} widget.el.remove(); widget = null; }
    if (pending) settle('reject', error('captcha_failed'));
    return new Promise((resolve, reject) => {
      pending = {resolve, reject, timer: runtime.setTimeout(() => settle('reject', error('captcha_timeout')), TIMEOUT_MS)};
      if (!widget) {
        const {el, slot} = box(doc, host);
        const id = turnstile.render(slot, {
          sitekey: SITEKEY, action, appearance: 'interaction-only', execution: 'execute', language: 'pt-br',
          callback: value => settle('resolve', value),
          'error-callback': () => { settle('reject', error('captcha_failed')); return true; },
          'expired-callback': () => {},
          'before-interactive-callback': () => { el.dataset.state = 'interactive'; el.scrollIntoView?.({block: 'nearest'}); },
          'after-interactive-callback': () => { el.dataset.state = 'idle'; },
        });
        widget = {id, el, host};
      } else {
        turnstile.reset(widget.id);
      }
      turnstile.execute(widget.id);
    });
  }

  function message(err) {
    if (err?.code === 'captcha_unavailable') return 'Não foi possível carregar a verificação de segurança. Confira a conexão e tente novamente.';
    if (err?.code === 'captcha_timeout') return 'A verificação de segurança não terminou. Tente novamente.';
    return 'A verificação de segurança falhou. Tente novamente.';
  }
  const isCaptchaError = err => /^captcha_/.test(err?.code || '');

  return {SITEKEY, token, message, isCaptchaError, load};
});
