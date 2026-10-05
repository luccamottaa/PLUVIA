'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness() {
 const nodes=new Map(),layers=[],removed=[],timers=new Map(),raf=[],requests=[];let id=0,now=Date.parse('2026-10-04T16:00Z');
 const node=name=>{if(!nodes.has(name))nodes.set(name,{textContent:'',hidden:false,attrs:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(){}});return nodes.get(name);};
 class Clock extends Date {static now(){return now;}}
 const ctx={Date:Clock,URL,document:{getElementById:node,querySelector:()=>({}),querySelectorAll:()=>[]},
  activeCity:{id:'1302603',timezone:'America/Manaus'},PLUVIA:{modules:{'weather-layers':{}},sources:{set(){}},http:{createClient:()=>({abortAll(){},async getJson(url){requests.push(url);return {host:'https://radar.test',radar:{past:[{time:now/1000,path:'/latest'},{time:now/1000-600,path:'/previous'},{time:now/1000,path:'/latest'}]}};},async getText(){return `<Domain>${new Clock(now).toISOString()}</Domain>`;}})}},
  setTimeout(fn,ms){timers.set(++id,{fn,ms});return id;},clearTimeout(i){timers.delete(i);},clearInterval(){},requestAnimationFrame(fn){raf.push(fn);},
  IntersectionObserver:class {observe(){}},L:{tileLayer(url){const layer={url,events:{},on(k,fn){this.events[k]=fn;return this;},addTo(){return this;},setOpacity(v){this.opacity=v;}};layers.push(layer);return layer;}}};
 const code=fs.readFileSync('dist/weather-map.js','utf8').replace('  let leafletPromise;','  globalThis.testMap={state,selectLayer,renderFrame,fadeTileLayer,resizeMap};\n  let leafletPromise;');
 vm.runInNewContext(code,ctx);
 const size={clientWidth:390,clientHeight:400};let invalidations=0;
 ctx.testMap.state.map={removeLayer(l){removed.push(l);},setMaxZoom(){},getZoom(){return 6;},getContainer(){return size;},invalidateSize(){invalidations++;}};
 return {api:ctx.testMap,node,layers,removed,timers,raf,requests,size,advance:ms=>now+=ms,invalidations:()=>invalidations,flush(){while(raf.length)raf.shift()();},ready(layer,failed=0){layer.events.tileload();for(let i=0;i<failed;i++)layer.events.tileerror();layer.events.load();}};
}
test('radar só muda horário quando a imagem chega; falhas e timeout preservam o último frame',async()=>{
 const h=harness();await h.api.selectLayer('rain');const first=h.layers.at(-1);
 assert.equal(h.node('weatherMap').attrs['aria-busy'],'true');assert.equal(h.node('weatherFrameTime').textContent,'Carregando…');
 h.ready(first);h.flush();const shown=h.node('weatherFrameTime').textContent;
 h.api.state.index=0;h.api.renderFrame();const pending=h.layers.at(-1);
 assert.equal(h.api.state.overlay,first);assert.equal(h.node('weatherFrameTime').textContent,shown);
 pending.events.tileerror();pending.events.load();assert.equal(h.api.state.nextOverlay,null);
 assert.equal(h.api.state.overlay,first);assert.equal(h.node('weatherFrameTime').textContent,shown);assert.equal(h.node('weatherMapRetry').hidden,false);
 h.api.renderFrame(true);const slow=h.layers.at(-1);h.api.state.timer=123;
 [...h.timers.values()].find(t=>t.ms===10000).fn();assert.equal(h.api.state.nextOverlay,null);assert.equal(h.api.state.timer,null);
 h.ready(slow);assert.equal(h.api.state.overlay,first,'late load cannot replace the retained frame');
 h.api.renderFrame(true);h.ready(h.layers.at(-1),1);assert.match(h.node('weatherFrameStatus').textContent,/Parte/);
 assert.equal(h.node('weatherMapRetry').hidden,false);assert.notEqual(h.node('weatherFrameTime').textContent,shown);
 h.api.renderFrame();assert.match(h.node('weatherFrameStatus').textContent,/Parte/,'reselecting the same partial image retains its warning');
});
test('mesmo frame não cria overlays; retorno ao radar reaproveita metadados por dois minutos',async()=>{
 const h=harness();await h.api.selectLayer('rain');const first=h.layers.at(-1),count=h.layers.length;
 assert.equal(h.api.state.frames.length,2,'duplicate timestamps are discarded');assert.ok(h.api.state.frames[0].time<h.api.state.frames[1].time);
 h.api.renderFrame();assert.equal(h.layers.length,count);h.ready(first);h.api.renderFrame();assert.equal(h.layers.length,count);
 h.api.state.index=0;h.api.renderFrame();const cancelled=h.layers.at(-1);
 h.api.state.index=1;h.api.renderFrame();h.ready(cancelled);assert.equal(h.api.state.overlay,first);assert.equal(h.api.state.nextOverlay,null);
 await h.api.selectLayer('clouds');await h.api.selectLayer('rain');assert.equal(h.requests.length,1);
 h.advance(120001);await h.api.selectLayer('rain');assert.equal(h.requests.length,2);
});
test('resize em rajada executa uma medição por frame e só invalida tamanho alterado',()=>{
 const h=harness();for(let i=0;i<10;i++)h.api.resizeMap();assert.equal(h.raf.length,1);
 h.flush();assert.equal(h.invalidations(),1);h.api.resizeMap();h.flush();assert.equal(h.invalidations(),1);
 h.size.clientHeight=500;for(let i=0;i<10;i++)h.api.resizeMap();h.flush();assert.equal(h.invalidations(),2);
});
test('fonte parcial também perde freshness depois do TTL',()=>{
 let now=1000;class Clock extends Date {static now(){return now;}}
 const context={Date:Clock};vm.runInNewContext(fs.readFileSync('dist/modules/sources.js','utf8'),context);
 context.PLUVIA.sources.set('radar',{status:'partial',checkedAt:now,dataAt:now});
 assert.equal(context.PLUVIA.sources.get('radar').status,'partial');now+=600001;
 assert.equal(context.PLUVIA.sources.get('radar').status,'stale');
});
