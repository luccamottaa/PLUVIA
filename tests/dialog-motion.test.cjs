const test=require('node:test');
const assert=require('node:assert/strict');
const create=require('../dist/modules/dialog-motion.js');
function setup({reduce=false}={}) {
  const dialog=new EventTarget();dialog.open=true;dialog.closes=0;
  const classes=new Set();dialog.classList={add:x=>classes.add(x),remove:x=>classes.delete(x)};
  dialog.close=()=>{dialog.open=false;dialog.closes++;dialog.dispatchEvent(new Event('close'));};
  const styles=new Map();dialog.style={setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)};
  const motion=new EventTarget();motion.matches=reduce;
  const timers=new Map();let clock=0;
  const scope={document:{querySelectorAll:()=>[dialog]},matchMedia:()=>motion,innerHeight:844,visualViewport:{height:500,offsetTop:200},getComputedStyle:()=>({transform:'matrix(1, 0, 0, 1, 0, -120)',opacity:'.7'}),setTimeout(fn){timers.set(++clock,fn);return clock;},clearTimeout(id){timers.delete(id);}};
  return {api:create(scope),dialog,motion,classes,timers,resolve:(name='pluvia-dialog-exit')=>{const event=new Event('animationend');event.animationName=name;dialog.dispatchEvent(event);},styles};
}
test('downward exit keeps modal open, starts at current entrance position and deduplicates',async()=>{
  const s=setup();s.api.close(s.dialog);s.api.close(s.dialog);
  assert.equal(s.dialog.open,true);assert.equal(s.timers.size,1);
  assert.equal(s.styles.get('--pluvia-exit-from'),'matrix(1, 0, 0, 1, 0, -120)');assert.equal(s.styles.get('--pluvia-exit-opacity'),'.7');assert.equal(s.styles.get('--pluvia-exit-distance'),'844px');
  s.resolve();await Promise.resolve();assert.equal(s.dialog.open,false);assert.equal(s.dialog.closes,1);assert.equal(s.timers.size,0);assert.equal(s.classes.size,0);
});
test('Escape animates and respects cancellation by another listener',async()=>{
  const s=setup();const event=new Event('cancel',{cancelable:true});s.dialog.dispatchEvent(event);
  assert.equal(event.defaultPrevented,true);assert.equal(s.dialog.open,true);s.resolve();await Promise.resolve();assert.equal(s.dialog.closes,1);
  s.dialog.open=true;const prevented=new Event('cancel',{cancelable:true});prevented.preventDefault();s.dialog.dispatchEvent(prevented);assert.equal(s.timers.size,0);
});
test('reduced motion closes immediately without starting an animation',()=>{
  const s=setup({reduce:true});s.api.close(s.dialog);assert.equal(s.dialog.open,false);assert.equal(s.timers.size,0);assert.equal(s.classes.size,0);assert.equal(s.styles.size,0);
});
test('native invalidation cancels pending close and does not close reopened dialog',async()=>{
  const s=setup();s.api.close(s.dialog);s.dialog.close();s.dialog.open=true;
  s.resolve();await Promise.resolve();assert.equal(s.dialog.open,true);assert.equal(s.dialog.closes,1);assert.equal(s.timers.size,0);assert.equal(s.classes.size,0);
});
test('changing motion preference finishes exit without trapping focus',async()=>{
  const s=setup();s.api.close(s.dialog);s.motion.matches=true;s.motion.dispatchEvent(new Event('change'));
  await Promise.resolve();assert.equal(s.dialog.open,false);assert.equal(s.dialog.closes,1);assert.equal(s.timers.size,0);
});
test('unrelated animation events do not close modal and missing frames cannot trap it',async()=>{
  const s=setup();s.api.close(s.dialog);s.resolve('pluvia-dialog-enter');assert.equal(s.dialog.open,true);[...s.timers.values()][0]();await Promise.resolve();assert.equal(s.dialog.closes,1);assert.equal(s.timers.size,0);
});
