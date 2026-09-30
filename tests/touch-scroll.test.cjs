const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('dist/app.js','utf8');
const source=app.slice(app.indexOf('function setupPullToRefresh()'),app.indexOf('document.querySelectorAll("nav a")'));
function setup() {
  const listeners=new Map(),fields=new Map();
  const $=id=>{if(!fields.has(id))fields.set(id,{hidden:true,style:{setProperty(){}},classList:{add(){},remove(){}},setAttribute(){}});return fields.get(id);};
  const document={documentElement:{classList:{add(){}}},
    addEventListener(type,fn,options){listeners.set(type,{fn,options});},
    removeEventListener(type,fn){if(listeners.get(type)?.fn===fn)listeners.delete(type);}};
  const window={ontouchstart:null,scrollY:0,visualViewport:{scale:1},CSS:{supports(){return true;}}};
  let refreshed=0;
  vm.runInNewContext(source+';setupPullToRefresh();',{document,window,navigator:{maxTouchPoints:1},activeCity:{id:'1302603'},$,clearTimeout(){},setTimeout(){},refreshAll:async()=>{refreshed++;return true;}});
  const touch=(x,y)=>({identifier:1,clientX:x,clientY:y});
  return {window,listeners,$,get refreshed(){return refreshed;},
    start({y=100,control=false}={}){listeners.get('touchstart').fn({touches:[touch(100,y)],target:{closest(){return control;}}});},
    move(x,y){let prevented=false;listeners.get('touchmove')?.fn({touches:[touch(x,y)],cancelable:true,preventDefault(){prevented=true;}});return prevented;},
    end(){return listeners.get('touchend').fn({touches:[]});}};
}
test('a rolagem normal não carrega um listener touchmove bloqueante',()=>{
  const s=setup();assert.equal(s.listeners.has('touchmove'),false);
  assert.equal(s.listeners.get('touchstart').options.passive,true);
  s.window.scrollY=300;s.start();assert.equal(s.listeners.has('touchmove'),false);
  s.window.scrollY=0;s.start({control:true});assert.equal(s.listeners.has('touchmove'),false);
});
test('rolar para cima ou na horizontal desarma imediatamente o gesto',()=>{
  for(const [x,y] of [[100,80],[160,110]]) {
    const s=setup();s.start();assert.equal(s.listeners.has('touchmove'),true);
    assert.equal(s.move(x,y),false);assert.equal(s.listeners.has('touchmove'),false);
  }
});
test('puxar do topo preserva a atualização e remove o bloqueio ao soltar',async()=>{
  const s=setup();s.start();assert.equal(s.move(100,200),true);
  assert.equal(s.$('pullRefreshText').textContent,'Solte para atualizar');
  await s.end();assert.equal(s.refreshed,1);assert.equal(s.listeners.has('touchmove'),false);
});
test('um puxão curto não atualiza e cancelar também libera a rolagem',async()=>{
  const s=setup();s.start();s.move(100,140);await s.end();
  assert.equal(s.refreshed,0);assert.equal(s.listeners.has('touchmove'),false);
  s.start();s.listeners.get('touchcancel').fn();assert.equal(s.listeners.has('touchmove'),false);
});
