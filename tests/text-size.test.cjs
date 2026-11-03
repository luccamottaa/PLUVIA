"use strict";
// Tamanho do texto (1.48): A− / A+ andam pelos passos, presos às pontas; o script do topo soma o ajuste ao do iPhone.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../dist/modules/text-size.js");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "dist/index.html"), "utf8");

test("passos de 87,5% a 137,5%, presos nas pontas; valor estranho volta a 100%", () => {
  assert.equal(ts.next(1, 1), 1.125);
  assert.equal(ts.next(1, -1), 0.875);
  assert.equal(ts.next(0.875, -1), 0.875);
  assert.equal(ts.next(1.375, 1), 1.375);
  assert.equal(ts.next(7, 1), 1.125);
  assert.equal(ts.label(1.125), "113%");
});

function runHead({ua, supports, store, apple, touch = 5}) {
  const start = html.indexOf("/* Tamanho do texto (1.48");
  const code = html.slice(html.lastIndexOf("<script>", start) + 8, html.indexOf("</script>", start));
  const style = {fontSize:"", font:""};
  const listeners = {};
  const ctx = {
    navigator:{userAgent:ua, maxTouchPoints:touch},
    CSS:{supports:() => supports},
    localStorage:{getItem:(k) => store[k] ?? null},
    document:{documentElement:{style, dataset:{}}, addEventListener:(t, f) => { listeners[t] = f; }, hidden:false},
    getComputedStyle:() => ({fontSize: style.font === "-apple-system-body" ? `${apple}px` : "16px"})
  };
  ctx.window = ctx;
  vm.runInNewContext(code, ctx);
  return {style, ctx};
}

test("iPhone com texto maior no sistema: segue o sistema; A+ soma em cima; limite de 26 px", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
  assert.equal(runHead({ua:iphone, supports:true, store:{}, apple:17}).style.fontSize, "");
  assert.equal(runHead({ua:iphone, supports:true, store:{}, apple:21}).style.fontSize, "20px");
  assert.equal(runHead({ua:iphone, supports:true, store:{"pluvia-text-scale":"1.25"}, apple:21}).style.fontSize, "24.5px");
  assert.equal(runHead({ua:iphone, supports:true, store:{"pluvia-text-scale":"1.375"}, apple:40}).style.fontSize, "26px");
});

test("fora da Apple só vale o A− / A+; Mac não lê a fonte do sistema", () => {
  const android = "Mozilla/5.0 (Linux; Android 14)";
  assert.equal(runHead({ua:android, supports:false, store:{}, apple:17}).style.fontSize, "");
  assert.equal(runHead({ua:android, supports:false, store:{"pluvia-text-scale":"0.875"}, apple:17}).style.fontSize, "14px");
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
  assert.equal(runHead({ua:mac, supports:true, store:{}, apple:13, touch:0}).style.fontSize, "");
});

test("linha no Mais do PLUVIA, script carregado e no precache", () => {
  const sw = fs.readFileSync(path.join(root, "dist/sw.js"), "utf8");
  assert.match(html, /id="textSizeDown"[^>]*aria-label="Diminuir o texto"/);
  assert.match(html, /id="textSizeUp"[^>]*aria-label="Aumentar o texto"/);
  assert.match(html, /modules\/text-size\.js\?v=text-size-1" defer/);
  assert.match(sw, /modules\/text-size\.js\?v=text-size-1/);
});
