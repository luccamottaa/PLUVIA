const test=require('node:test');
const assert=require('node:assert/strict');
const create=require('../dist/modules/dialog-motion.js');
function setup({reduce=false}={}) {
  const dialog=new EventTarget();dialog.open=true;dialog.closes=0;
  const classes=new Set();dialog.classList={add:x=>classes.add(x),remove:x=>classes.delete(x)};
  dialog.close=()=>{dialog.open=false;dialog.closes++;dialog.dispatchEvent(new Event('close'));};
  let resolve,reject,cancelled=0,animations=0,frames,options;
  const motion=new EventTarget();motion.matches=reduce;
  const timers=new Map();let clock=0;
  dialog.animate=(keys,opts)=>{animations++;frames=keys;options=opts;return {finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),cancel(){cancelled++;reject(new Error('cancelled'));}};};
  const scope={document:{querySelectorAll:()=>[dialog]},matchMedia:()=>motion,innerHeight:844,visualViewport:{height:500,offsetTop:200},getComputedStyle:()=>({transform:'matrix(1, 0, 0, 1, 0, -120)',opacity:'.7'}),setTimeout(fn){timers.set(++clock,fn);return clock;},clearTimeout(id){timers.delete(id);}};
  return {api:create(scope),dialog,motion,classes,timers,resolve:()=>resolve(),reject:()=>reject(new Error('interrupted')),details:()=>({animations,cancelled,frames,options})};
}
test('downward exit keeps modal open, starts at current entrance position and deduplicates',async()=>{
  const s=setup();s.api.close(s.dialog);s.api.close(s.dialog);
  assert.equal(s.dialog.open,true);assert.equal(s.details().animations,1);
  assert.deepEqual(s.details().frames,[{transform:'matrix(1, 0, 0, 1, 0, -120)',opacity:'.7'},{transform:'translateY(844px)',opacity:0}]);
  s.resolve();await Promise.resolve();assert.equal(s.dialog.open,false);assert.equal(s.dialog.closes,1);assert.equal(s.timers.size,0);assert.equal(s.classes.size,0);
});
test('Escape animates and respects cancellation by another listener',async()=>{
  const s=setup();const event=new Event('cancel',{cancelable:true});s.dialog.dispatchEvent(event);
  assert.equal(event.defaultPrevented,true);assert.equal(s.dialog.open,true);s.resolve();await Promise.resolve();assert.equal(s.dialog.closes,1);
  s.dialog.open=true;const prevented=new Event('cancel',{cancelable:true});prevented.preventDefault();s.dialog.dispatchEvent(prevented);assert.equal(s.details().animations,1);
});
test('reduced motion and unsupported animation close immediately',()=>{
  const s=setup({reduce:true});s.api.close(s.dialog);assert.equal(s.dialog.open,false);assert.equal(s.details().animations,0);
  const legacy=setup();delete legacy.dialog.animate;legacy.api.close(legacy.dialog);assert.equal(legacy.dialog.open,false);
});
test('native invalidation cancels pending close and does not close reopened dialog',async()=>{
  const s=setup();s.api.close(s.dialog);s.dialog.close();s.dialog.open=true;
  s.resolve();await Promise.resolve();assert.equal(s.dialog.open,true);assert.equal(s.dialog.closes,1);assert.equal(s.timers.size,0);assert.equal(s.classes.size,0);
});
test('changing motion preference finishes exit without trapping focus',async()=>{
  const s=setup();s.api.close(s.dialog);s.motion.matches=true;s.motion.dispatchEvent(new Event('change'));
  await Promise.resolve();assert.equal(s.dialog.open,false);assert.equal(s.dialog.closes,1);assert.equal(s.timers.size,0);
});
test('missing frames or interrupted animation cannot trap modal',async()=>{
  const s=setup();s.api.close(s.dialog);[...s.timers.values()][0]();await Promise.resolve();assert.equal(s.dialog.closes,1);assert.equal(s.timers.size,0);
  const interrupted=setup();interrupted.api.close(interrupted.dialog);interrupted.reject();await Promise.resolve();assert.equal(interrupted.dialog.closes,1);
});
