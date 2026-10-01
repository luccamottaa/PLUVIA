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
  return {close};
});
