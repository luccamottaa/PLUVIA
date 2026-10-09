/* Native dialogs keep their top layer and focus until the downward exit finishes. */
(function(root, factory) {
  if(typeof module==='object' && module.exports) module.exports=factory;
  else (root.PLUVIA=root.PLUVIA||{}).dialogs=factory(root);
})(globalThis, function(scope) {
  const pending=new WeakMap();
  const motion=scope.matchMedia?.('(prefers-reduced-motion: reduce)');
  function close(dialog) {
    if(!dialog?.open || pending.has(dialog)) return true;
    if(motion?.matches) {dialog.close();return true;}
    // Read once, including an entrance still in progress. Never measure per frame.
    const style=scope.getComputedStyle(dialog);
    const distance=Math.max(scope.innerHeight, (scope.visualViewport?.height||0)+(scope.visualViewport?.offsetTop||0));
    dialog.style.setProperty('--pluvia-exit-from',style.transform);
    dialog.style.setProperty('--pluvia-exit-opacity',style.opacity);
    dialog.style.setProperty('--pluvia-exit-distance',`${distance}px`);
    const token={};pending.set(dialog,token);
    dialog.classList.add('pluvia-dialog-closing');
    function cleanup() {
      if(pending.get(dialog)!==token) return;
      pending.delete(dialog);scope.clearTimeout(token.timer);
      dialog.removeEventListener('close',cleanup);
      dialog.removeEventListener('animationend',ended);
      motion?.removeEventListener?.('change',finish);
      dialog.classList.remove('pluvia-dialog-closing');
      for(const name of ['--pluvia-exit-from','--pluvia-exit-opacity','--pluvia-exit-distance']) dialog.style.removeProperty(name);
    }
    function finish() {
      if(pending.get(dialog)!==token) return;
      cleanup();if(dialog.open) dialog.close();
    }
    function ended(event) {
      if(event.target===dialog && event.animationName==='pluvia-dialog-exit') finish();
    }
    dialog.addEventListener('close',cleanup);
    dialog.addEventListener('animationend',ended);
    motion?.addEventListener?.('change',finish);
    // Native close (city invalidation) cancels the pending exit; absent frames cannot trap a modal.
    token.timer=scope.setTimeout(finish,500);
    return true;
  }
  scope.document.querySelectorAll('dialog').forEach(dialog=>{
    dialog.addEventListener('cancel',event=>{if(!event.defaultPrevented) {event.preventDefault();close(dialog);}});
  });
  // <details> open and close by height: grid-template-rows 0fr <-> 1fr on a wrapper created on the
  // first tap (layout only: no new layer, nothing measured per frame). Content rendered lazily on
  // `toggle` (the chart) grows with the 1fr row. ⓘ keeps its own motion in app.js.
  const DETAILS_MS=340;
  const still=()=>Boolean(motion?.matches);
  function wrapper(details) {
    const summary=details.querySelector(':scope > summary');
    let wrap=details.querySelector(':scope > .details-motion');
    if(wrap) return wrap;
    wrap=scope.document.createElement('div');wrap.className='details-motion';
    const inner=scope.document.createElement('div');inner.className='details-motion-inner';
    for(const node of Array.from(details.childNodes)) if(node!==summary) inner.append(node);
    wrap.append(inner);details.append(wrap);
    return wrap;
  }
  function toggleDetails(details) {
    if(still()) {details.open=!details.open;return;}
    const wrap=wrapper(details);
    scope.clearTimeout(wrap.pluviaTimer);
    wrap.dataset.moving='true';
    if(details.open && !wrap.hasAttribute('data-collapsed')) {wrap.dataset.collapsed='true';details.dataset.closing='true';}
    else {
      delete details.dataset.closing;
      if(!details.open) {wrap.dataset.collapsed='true';details.open=true;scope.getComputedStyle(wrap).gridTemplateRows;}
      delete wrap.dataset.collapsed;
    }
    wrap.pluviaTimer=scope.setTimeout(()=>{
      delete wrap.dataset.moving;
      if(wrap.hasAttribute('data-collapsed')) {details.open=false;delete wrap.dataset.collapsed;delete details.dataset.closing;}
    },DETAILS_MS);
  }
  // Wrapped up front so the layout (e.g. the chart summary spacing) is the same before and after the
  // first tap; details created later (alert detail) are wrapped on their first tap.
  scope.document.querySelectorAll('details:not(.info-tip)').forEach(details=>{if(details.localName==='details') wrapper(details);});
  scope.document.addEventListener?.('click',event=>{
    const summary=event.target?.closest?.('summary'),details=summary?.parentElement;
    if(event.defaultPrevented || details?.localName!=='details' || details.classList.contains('info-tip') || still()) return;
    if(details.querySelector(':scope > summary')!==summary) return;
    event.preventDefault();toggleDetails(details);
  });
  return {close,toggleDetails};
});
