const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('converte lat/lon em tile sem tratar ausência de eco como céu seco', () => {
  const context = { globalThis: null, module: { exports: {} }, document: undefined };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('dist/modules/radar-probe.js', 'utf8'), context);
  const radar = context.PLUVIA.radar;
  const manaus = radar.lonLatToPixel(-60.021, -3.119, 9);
  assert.equal(Number.isInteger(manaus.tileX), true);
  assert.equal(manaus.px >= 0 && manaus.px < 256, true);
  const idle = radar.get();
  assert.equal(idle.precipitating, false);
  assert.equal(idle.status, 'idle');
});
