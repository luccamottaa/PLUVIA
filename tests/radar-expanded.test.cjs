const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('ampliar e fechar preserva o mapa e os frames, restaura a página e pausa o player',()=>{
 const nodes=new Map();let resized=0,stopped=0,focused='';
 const home={appendChild(child){child.parentElement=this;}};
 const node=id=>{
  if(!nodes.has(id)) nodes.set(id,{parentElement:home,hidden:false,attrs:{},events:{},style:{},
   addEventListener(type,fn){this.events[type]=fn;},setAttribute(key,value){this.attrs[key]=value;},
   appendChild(child){child.parentElement=this;},focus(){focused=id;},showModal(){this.open=true;},close(){this.open=false;this.events.close?.();}});
  return nodes.get(id);
 };
 const context={document:{body:{style:{overflow:'auto'}},getElementById:node,querySelector:()=>({}),querySelectorAll:()=>[],addEventListener(){}},
  PLUVIA:{modules:{'weather-layers':{}}},activeCity:{id:'1302603'},IntersectionObserver:class{observe(){}},
  requestAnimationFrame:fn=>fn(),clearInterval:()=>stopped++,URL,addEventListener(){}};
 const code=fs.readFileSync('dist/weather-map.js','utf8').replace('  let leafletPromise;','  globalThis.testState=state;\n  let leafletPromise;');
 vm.runInNewContext(code,context);
 const map={invalidateSize(){resized++;}},frames=[{time:123}];context.testState.map=map;context.testState.frames=frames;context.testState.index=0;context.testState.timer=1;
 node('expandRadar').events.click();assert.equal(node('radarDialog').open,true);assert.equal(node('radarMapContent').parentElement,node('radarDialogContent'));assert.equal(focused,'closeRadar');assert.equal(context.document.body.style.overflow,'hidden');
 node('closeRadar').events.click();assert.equal(node('radarDialog').open,false);assert.equal(node('radarMapContent').parentElement,home);assert.equal(context.document.body.style.overflow,'auto');assert.equal(focused,'expandRadar');assert.equal(context.testState.timer,null);assert.equal(stopped,1);assert.equal(context.testState.map,map);assert.equal(context.testState.frames,frames);assert.equal(resized,2);
});
