const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, {textContent:'', hidden:false, addEventListener(){}, setAttribute(){}});
  return nodes.get(id);
};
let requests = [];
const layers = [];
const context = {
  document:{getElementById:node,querySelector:()=>({}),querySelectorAll:()=>[],createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(pixels){cloudPixels=pixels.data;}}),toDataURL:()=> 'data:image/png;base64,test'})},
  activeCity:{id:'1302603',lat:-3,lon:-60,timezone:'America/Manaus'},
  PLUVIA:{modules:{'weather-layers':{}},sources:{set(){}}},
  fetch:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),
  AbortController, URLSearchParams, setTimeout, clearTimeout, clearInterval,
  requestAnimationFrame:fn=>fn(),
  IntersectionObserver:class { observe(){} disconnect(){} },
  L:{tileLayer:(url,options)=>{const layer={url,options,opacity:null,events:{},on(name,fn){this.events[name]=fn;return this;},addTo(){return this;},setOpacity(value){this.opacity=value;}};layers.push(layer);return layer;},layerGroup:()=>({addTo(){return this}})}
};
let code = fs.readFileSync('dist/weather-map.js','utf8');
code = code.replace('  let leafletPromise;', '  globalThis.testMap = {selectLayer, state, satelliteFrames, fadeTileLayer};\n  let leafletPromise;');
vm.runInNewContext(fs.readFileSync('dist/modules/http-client.js','utf8'),context);
vm.runInNewContext(code,context);
context.testMap.state.map = {removeLayer(){},setMaxZoom(value){this.maxZoom=value;},getZoom(){return 7;},setZoom(value){this.zoom=value;}};
const response = body => ({ok:true,json:async()=>body,text:async()=>body});
const latest = Math.floor(Date.now()/600000)*600000;
const clouds = `<Domains><Domain>${new Date(latest-3600000).toISOString()}/${new Date(latest).toISOString()}/PT10M</Domain></Domains>`;
(async()=>{
  const old = context.testMap.selectLayer('rain');
  const next = context.testMap.selectLayer('clouds');
  requests[1].resolve(response(clouds));
  await next;
  const shown = node('weatherFrameTime').textContent;
  requests[0].reject(new Error('Cancelled old request'));
  await old;
  assert.equal(node('weatherFrameTime').textContent,shown);
  assert.equal(node('weatherMapError').textContent,'');
  assert.equal(context.testMap.state.frames.length,7);
  assert.equal(context.testMap.state.frames.at(-1).time,latest/1000);
  assert.match(layers.at(-1).url,/GOES-East_ABI_GeoColor/);
  const first=layers.at(-1);
  first.events.load();
  assert.equal(context.testMap.state.overlay,first);
  assert.equal(first.opacity,.92,"satellite clouds remain visible at high opacity");
  assert.equal(first.options.maxNativeZoom,6);
  assert.equal(first.options.maxZoom,6,"avoid enlarging satellite pixels beyond their native zoom");
  assert.equal(context.testMap.state.map.maxZoom,6);
  assert.equal(context.testMap.state.map.zoom,6);
  const second=context.L.tileLayer('next');
  context.testMap.fadeTileLayer(second,.62);
  assert.equal(context.testMap.state.overlay,first,'keep displayed image while next loads');
  second.events.load();
  assert.equal(context.testMap.state.overlay,second,'swap only after new tiles load');
  assert.throws(()=>context.testMap.satelliteFrames('<Domain>2020-01-01T00:00:00Z</Domain>'),/Sem imagens recentes/);
  const missing = context.testMap.selectLayer('clouds');
  requests[2].resolve(response('<Domains/>'));
  await missing;
  assert.equal(node('weatherFrameTime').textContent,'Indisponível');
  assert.equal(context.testMap.state.frames.length,0);
  assert.match(node('weatherMapError').textContent,/temporariamente indisponível/);
  console.log('PASS map requests: cancelled layer cannot overwrite satellite; missing or stale frames fail honestly.');
})().catch(error=>{console.error(error);process.exitCode=1});

