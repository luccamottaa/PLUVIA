/* Aceite dos Termos de uso e da Privacidade onde há dados (pedido do usuário, outubro/2026): caixinha
   obrigatória ao criar conta e ao ligar avisos, e um aviso discreto no primeiro acesso, sem bloquear a
   previsão. O aceite fica neste aparelho por versão dos Termos (mudou a versão, pede de novo); a conta
   também guarda a versão aceita no cadastro. Sem telemetria. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).terms = api;
  if (root.document && typeof module !== 'object') api.mount(root.document);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (runtime) {
  'use strict';
  // Data da "Última atualização" em /termos/. Mudou o texto de forma relevante, mude aqui.
  const VERSION = '2026-10-10';
  const KEY = 'pluvia-terms', NOTICE_KEY = 'pluvia-terms-notice';
  const VIA = ['push', 'signup', 'social'];
  let memory = null, noticeMemory = null;

  function read(key, storage = runtime.localStorage) {
    try { const value = JSON.parse(storage?.getItem?.(key) || 'null'); return value && typeof value === 'object' ? value : null; } catch { return null; }
  }
  function write(key, value, storage = runtime.localStorage) { try { storage?.setItem?.(key, JSON.stringify(value)); } catch {} }
  function accepted(storage) { return (read(KEY, storage) || memory)?.version === VERSION; }
  function accept(via, storage, now = Date.now()) {
    const record = {version:VERSION, at:new Date(now).toISOString(), via:VIA.includes(via) ? via : 'push'};
    memory = record; write(KEY, record, storage);
    return record;
  }
  // O aviso do primeiro acesso aparece até ser fechado, ou até um aceite completo, nesta versão.
  function noticeNeeded(storage) { return !accepted(storage) && (read(NOTICE_KEY, storage) || noticeMemory)?.version !== VERSION; }
  function dismissNotice(storage, now = Date.now()) { noticeMemory = {version:VERSION, at:new Date(now).toISOString()}; write(NOTICE_KEY, noticeMemory, storage); }

  // Pedido antes de ligar avisos: onAccept roda dentro do toque em "Aceitar e ligar avisos" (o iPhone só
  // mostra o pedido de permissão de notificação dentro de um toque).
  let pending = null;
  function ask(onAccept, doc = runtime.document) {
    if (accepted()) { onAccept?.(); return true; }
    const dialog = doc?.getElementById?.('termsDialog');
    if (!dialog?.showModal) { onAccept?.(); return true; }
    pending = onAccept;
    const check = doc.getElementById('termsCheck'), button = doc.getElementById('termsAccept');
    if (check) check.checked = false;
    if (button) button.disabled = true;
    if (!dialog.open) dialog.showModal();
    return false;
  }

  function mount(doc) {
    const el = id => doc.getElementById(id);
    const dialog = el('termsDialog'), check = el('termsCheck'), button = el('termsAccept');
    const close = () => { pending = null; if (dialog?.open) (runtime.PLUVIA?.dialogs?.close?.(dialog) ?? dialog.close()); };
    check?.addEventListener('change', () => { if (button) button.disabled = !check.checked; });
    button?.addEventListener('click', () => {
      if (!check?.checked) return;
      accept('push');
      const run = pending; pending = null;
      if (dialog?.open) (runtime.PLUVIA?.dialogs?.close?.(dialog) ?? dialog.close());
      hideNotice();
      run?.();
    });
    el('termsCancel')?.addEventListener('click', close);
    el('termsClose')?.addEventListener('click', close);
    dialog?.addEventListener('click', event => { if (event.target === dialog) close(); });
    dialog?.addEventListener('close', () => { pending = null; });

    // Aviso discreto do primeiro acesso: depois da intro, fixo embaixo, com "OK".
    const notice = el('termsNotice');
    function hideNotice() { if (notice) notice.hidden = true; }
    el('termsNoticeOk')?.addEventListener('click', () => { dismissNotice(); hideNotice(); });
    function showNotice() {
      if (!notice || !noticeNeeded()) return;
      const intro = el('pluviaIntro');
      if (intro && !intro.hidden) return;
      notice.hidden = false;
    }
    const intro = el('pluviaIntro');
    if (intro && runtime.MutationObserver) {
      const observer = new runtime.MutationObserver(() => { if (intro.hidden) { observer.disconnect(); showNotice(); } });
      observer.observe(intro, {attributes:true, attributeFilter:['hidden']});
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', showNotice, {once:true});
    else showNotice();
  }

  return {VERSION, KEY, NOTICE_KEY, accepted, accept, noticeNeeded, dismissNotice, ask, mount};
});
