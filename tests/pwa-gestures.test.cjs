const test = require('node:test');
const assert = require('node:assert/strict');
const install = require('../dist/modules/pwa-gestures.js');

function setup({displayMode=false, appleStandalone=false}={}) {
  const attrs = new Set();
  const document = new EventTarget();
  document.documentElement = {toggleAttribute(name, value) { value ? attrs.add(name) : attrs.delete(name); }};
  const mode = new EventTarget(); mode.matches = displayMode;
  install({document, navigator:{standalone:appleStandalone}, matchMedia:query => {
    assert.equal(query, '(display-mode: standalone)'); return mode;
  }});
  const dispatch = (name, insideMap=false) => {
    const event = new Event(name, {cancelable:true});
    Object.defineProperty(event, 'target', {value:{closest:selector => {
      assert.equal(selector, '#weatherMap'); return insideMap ? {} : null;
    }}});
    document.dispatchEvent(event); return event.defaultPrevented;
  };
  return {attrs,mode,dispatch};
}

test('browser keeps page pinch and ordinary touches available', () => {
  const s = setup();
  assert.equal(s.attrs.has('data-pwa-no-zoom'), false);
  for (const name of ['gesturestart','gesturechange','touchstart','touchmove','touchend','dblclick']) assert.equal(s.dispatch(name), false);
});
test('installed display mode blocks page pinch without cancelling single touches', () => {
  const s = setup({displayMode:true});
  assert.equal(s.attrs.has('data-pwa-no-zoom'), true);
  for (const name of ['gesturestart','gesturechange']) assert.equal(s.dispatch(name), true);
  for (const name of ['touchstart','touchmove','touchend','click']) assert.equal(s.dispatch(name), false);
});
test('Apple standalone flag activates the same installed policy', () => {
  const s = setup({appleStandalone:true});
  assert.equal(s.attrs.has('data-pwa-no-zoom'), true);
  assert.equal(s.dispatch('gesturestart'), true);
});
test('map gestures remain available inside the installed app', () => {
  const s = setup({displayMode:true});
  for (const name of ['gesturestart','gesturechange']) {
    assert.equal(s.dispatch(name, true), false);
    assert.equal(s.dispatch(name), true);
  }
});
test('leaving standalone removes page gesture cancellation and reentering restores it', () => {
  const s = setup({displayMode:true});
  s.mode.matches=false; s.mode.dispatchEvent(new Event('change'));
  assert.equal(s.attrs.has('data-pwa-no-zoom'), false);
  assert.equal(s.dispatch('gesturechange'), false);
  s.mode.matches=true; s.mode.dispatchEvent(new Event('change'));
  assert.equal(s.attrs.has('data-pwa-no-zoom'), true);
  assert.equal(s.dispatch('gesturechange'), true);
});
