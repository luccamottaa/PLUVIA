const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, {textContent:'', hidden:false, addEventListener(){}, setAttribute(){}});
  return nodes.get(id);
};
let requests = [];
const context = {
  document:{getElementById:node,querySelectorAll:()=>[]},
  activeCity:{id:'1302603',lat:-3,lon:-60,timezone:'America/Manaus'},
  PLUVIA:{modules:{'weather-layers':{}},sources:{set(){}}},
  fetch:()=>new Promise((resolve,reject)=>requests.push({resolve,reject})),
  AbortController, URLSearchParams, setTimeout, clearTimeout, clearInterval,
  requestAnimationFrame:fn=>fn(),
  L:{rectangle:()=>({}),layerGroup:()=>({addTo(){return this}})}
};
let code = fs.readFileSync('dist/weather-map.js','utf8');
code = code.replace('  let leafletPromise;', '  globalThis.testMap = {selectLayer, state};\n  let leafletPromise;');
vm.runInNewContext(code,context);
context.testMap.state.map = {removeLayer(){}};
const response = body => ({ok:true,json:async()=>body});
const clouds = value => Array.from({length:9},()=>({hourly:{time:[1789041600],cloud_cover:[value]}}));
(async()=>{
  const old = context.testMap.selectLayer('rain');
  const next = context.testMap.selectLayer('clouds');
  requests[1].resolve(response(clouds(65)));
  await next;
  const shown = node('weatherFrameTime').textContent;
  requests[0].reject(new Error('Cancelled old request'));
  await old;
  assert.equal(node('weatherFrameTime').textContent,shown);
  assert.equal(node('weatherMapError').textContent,'');
  assert.equal(context.testMap.state.frames[0].values[0],65);
  const missing = context.testMap.selectLayer('clouds');
  requests[2].resolve(response(clouds(null)));
  await missing;
  assert.equal(node('weatherFrameTime').textContent,'Indisponível');
  assert.equal(context.testMap.state.frames.length,0);
  assert.match(node('weatherMapError').textContent,/temporariamente indisponível/);
  console.log('PASS map requests: cancelled layer cannot overwrite current layer; missing cloud values fail honestly.');
})().catch(error=>{console.error(error);process.exitCode=1});
