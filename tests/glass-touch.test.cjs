"use strict";
// Vidro que reage ao toque (1.46): cresce no toque, estica atrás do dedo sem passar do limite e volta com mola.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const glass = require("../dist/modules/glass-touch.js");
const root = path.join(__dirname, "..");

test("parado, o vidro só cresce; arrastando, estica no sentido do dedo e afina no outro", () => {
  assert.deepEqual(glass.stretch(0, 0, 44, 44), {tx:0, ty:0, sx:glass.GROW, sy:glass.GROW});
  const right = glass.stretch(22, 0, 44, 44);
  assert.ok(right.tx > 0 && right.ty === 0);
  assert.ok(right.sx > glass.GROW && right.sy < glass.GROW);
  const left = glass.stretch(-22, 0, 44, 44);
  assert.equal(left.tx, -right.tx);
  assert.equal(left.sx, right.sx);
  const down = glass.stretch(0, 30, 96, 44);
  assert.ok(down.ty > 0 && down.sy > glass.GROW);
});

test("puxar longe é elástico: nunca passa de MAX px nem estica sem limite", () => {
  for (const d of [200, 2000, -5000]) {
    const s = glass.stretch(d, d, 44, 44);
    assert.ok(Math.abs(s.tx) <= glass.MAX && Math.abs(s.ty) <= glass.MAX);
    assert.ok(s.sx <= glass.GROW + 0.08 && s.sy <= glass.GROW + 0.08);
  }
  const s = glass.stretch(NaN, undefined, 0, -3);
  assert.deepEqual(s, {tx:0, ty:0, sx:glass.GROW, sy:glass.GROW});
});

test("toque cresce o botão, arraste estica, soltar volta com mola e limpa o estado", () => {
  const listeners = {}, docListeners = {};
  const style = {props:{}, setProperty(k, v) { this.props[k] = v; }, transform:"", transition:""};
  const elListeners = {};
  const el = {
    dataset:{}, style, disabled:false, matches:() => false,
    getBoundingClientRect:() => ({left:100, top:20, width:44, height:44}),
    addEventListener(t, f) { elListeners[t] = f; }, removeEventListener(t) { delete elListeners[t]; }
  };
  const target = {closest:(sel) => (sel === glass.SELECTOR ? el : null)};
  const rootObj = {
    document:{addEventListener(t, f) { docListeners[t] = f; }, hidden:false},
    addEventListener(t, f) { listeners[t] = f; },
    requestAnimationFrame(f) { f(); return 1; }, cancelAnimationFrame() {},
    matchMedia:() => ({matches:false}), CSS:{supports:() => true}
  };
  glass.start(rootObj);
  docListeners.pointerdown({button:0, pointerId:7, clientX:122, clientY:42, target});
  assert.equal(el.dataset.glassPress, "");
  assert.match(style.transform, /^scale\(1\.12\)$/);
  assert.equal(style.props["--gx"], "50%");
  listeners.pointermove({pointerId:7, clientX:150, clientY:42});
  assert.match(style.transform, /^translate\([\d.]+px, 0px\) scale\(/);
  assert.equal(style.props["--gx"], "100%");
  listeners.pointerup({pointerId:7});
  assert.equal(el.dataset.glassPress, undefined);
  assert.equal(style.transform, "");
  assert.match(style.transition, /^transform \.62s linear\(/);
  elListeners.transitionend({target:el});
  assert.equal(style.transition, "");
});

test("movimento reduzido: só o brilho, sem transform", () => {
  const docListeners = {}, listeners = {};
  const style = {props:{}, setProperty(k, v) { this.props[k] = v; }, transform:"", transition:""};
  const el = {dataset:{}, style, matches:() => false, getBoundingClientRect:() => ({left:0, top:0, width:44, height:44}), addEventListener() {}, removeEventListener() {}};
  glass.start({document:{addEventListener(t, f) { docListeners[t] = f; }}, addEventListener(t, f) { listeners[t] = f; }, matchMedia:() => ({matches:true})});
  docListeners.pointerdown({button:0, pointerId:1, clientX:10, clientY:10, target:{closest:() => el}});
  listeners.pointermove({pointerId:1, clientX:40, clientY:10});
  assert.equal(el.dataset.glassPress, "");
  assert.equal(style.transform, "");
  listeners.pointercancel({pointerId:1});
  assert.equal(el.dataset.glassPress, undefined);
});

test("script carregado e no precache; CSS do brilho e pílula tocável", () => {
  const html = fs.readFileSync(path.join(root, "dist/index.html"), "utf8");
  const sw = fs.readFileSync(path.join(root, "dist/sw.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "dist/continuous.css"), "utf8");
  assert.match(html, /modules\/glass-touch\.js\?v=glass-3" defer/);
  assert.match(sw, /modules\/glass-touch\.js\?v=glass-3/);
  assert.match(css, /html body \.dialog-close\[data-glass-press\]::after \{ opacity:1;/);
  assert.match(css, /compact-head\[data-on\] \.compact-pill \{ pointer-events:auto;/);
  assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(root, "dist/modules/glass-touch.js"), "utf8")));
});
