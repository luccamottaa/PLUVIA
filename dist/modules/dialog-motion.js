/* Native dialogs keep their top layer and focus until the downward exit finishes. */
(function(root, factory) {
  if(typeof module==='object' && module.exports) module.exports=factory;
  else (root.PLUVIA=root.PLUVIA||{}).dialogs=factory(root);
})(globalThis, function(scope) {
  const pending=new WeakMap();
  const motion=scope.matchMedia?.('(prefers-reduced-motion: reduce)');
  function close(dialog) {
    if(!dialog?.open || pending.has(dialog)) return true;
    if(motion?.matches || !dialog.animate) {dialog.close();return true;}
    // Read once, including an entrance still in progress. Never measure per frame.
    const style=scope.getComputedStyle(dialog);
    const distance=Math.max(scope.innerHeight, (scope.visualViewport?.height||0)+(scope.visualViewport?.offsetTop||0));
    const animation=dialog.animate([
      {transform:style.transform,opacity:style.opacity},
      {transform:`translateY(${distance}px)`,opacity:0}
    ],{duration:280,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});
    const token={animation};pending.set(dialog,token);
    dialog.classList.add('pluvia-dialog-closing');
    function cleanup() {
      if(pending.get(dialog)!==token) return;
      pending.delete(dialog);scope.clearTimeout(token.timer);
      dialog.removeEventListener('close',cleanup);
      motion?.removeEventListener?.('change',finish);
      dialog.classList.remove('pluvia-dialog-closing');animation.cancel();
    }
    function finish() {
      if(pending.get(dialog)!==token) return;
      cleanup();if(dialog.open) dialog.close();
    }
    dialog.addEventListener('close',cleanup);
    motion?.addEventListener?.('change',finish);
    // Native close (city invalidation) cancels the pending exit; absent frames cannot trap a modal.
    token.timer=scope.setTimeout(finish,500);
    animation.finished.then(finish,finish);
    return true;
  }
  scope.document.querySelectorAll('dialog').forEach(dialog=>{
    dialog.addEventListener('cancel',event=>{if(!event.defaultPrevented) {event.preventDefault();close(dialog);}});
  });
  return {close};
});
