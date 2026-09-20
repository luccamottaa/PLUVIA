const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function runtime({fetchImpl,setTimeoutImpl=setTimeout,clearTimeoutImpl=clearTimeout} = {}) {
  const sourceStates = [];
  class FakeImage {
    set src(value) {
      this._src = value;
      if (value) queueMicrotask(() => this.onload?.());
    }
    get src() { return this._src; }
    width = 256;
    height = 256;
  }
  const context = {
    globalThis: null,
    module: { exports: {} },
    AbortController,
    setTimeout:setTimeoutImpl,
    clearTimeout:clearTimeoutImpl,
    queueMicrotask,
    Image: FakeImage,
    fetch: fetchImpl || (async () => ({ok:true,json:async()=>({radar:{past:[{host:'https://tiles.example',path:'/frame',time:123}]}})})),
    document: {createElement: () => ({getContext: () => ({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray([0,0,0,255,0,0,0,255,0,0,0,255])})})})},
    PLUVIA: {sources:{set:(id,value)=>sourceStates.push({id,...value})}}
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('dist/modules/radar-probe.js', 'utf8'), context);
  return {radar:context.PLUVIA.radar,sourceStates};
}

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

test('deduplica probe em voo, lê o tile e reaproveita resultado dentro do TTL', async () => {
  let fetches = 0;
  const {radar,sourceStates} = runtime({fetchImpl:async()=>{
    fetches++;
    return {ok:true,json:async()=>({radar:{past:[{host:'https://tiles.example',path:'/frame',time:123}]}})};
  }});
  const city = {id:'1302603',lat:-3.119,lon:-60.021};
  const first = radar.probe(city);
  const duplicate = radar.probe(city);
  assert.equal(first, duplicate);
  const result = await first;
  assert.equal(result.status, 'ready');
  assert.equal(result.precipitating, true);
  await radar.probe(city);
  assert.equal(fetches, 1);
  assert.equal(sourceStates.at(-1).status, 'ready');
});

test('reset cancela request antigo e impede radar de outra cidade de vazar', async () => {
  let aborted = false;
  const {radar} = runtime({fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>{
    signal.addEventListener('abort',()=>{aborted=true; reject(new Error('aborted'));},{once:true});
  })});
  const pending = radar.probe({id:'3550308',lat:-23.55,lon:-46.63});
  const reset = radar.reset('1302603');
  assert.equal(reset.cityId, '1302603');
  assert.equal(reset.status, 'idle');
  await pending;
  assert.equal(aborted, true);
  assert.equal(radar.get().cityId, '1302603');
  assert.equal(radar.get().precipitating, false);
});

test('timeout aborta a consulta e publica estado distinto de erro comum', async () => {
  const {radar,sourceStates} = runtime({
    setTimeoutImpl: callback => { queueMicrotask(callback); return 1; },
    clearTimeoutImpl: () => {},
    fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>{
      if (signal.aborted) { reject(new Error('aborted')); return; }
      signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
    })
  });
  const result = await radar.probe({id:'1302603',lat:-3.119,lon:-60.021});
  assert.equal(result.status, 'unavailable');
  assert.equal(sourceStates.at(-1).status, 'timeout');
});
