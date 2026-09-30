const {test}=require('node:test');
const assert=require('node:assert/strict');
const {observeMotion}=require('../dist/modules/sky-atmosphere.js');

function setup(withObserver=true) {
  const scene={dataset:{}},opening={dataset:{}};
  const intro={hidden:false,leaving:false,classList:{contains(){return intro.leaving;}},querySelector(){return opening;}};
  const listeners={};
  const document={hidden:false,querySelector(){return scene;},getElementById(){return intro;},addEventListener(type,fn){listeners[type]=fn;}};
  let callback;
  class Observer { constructor(fn){callback=fn;} observe(node){assert.equal(node,scene);} }
  const motion=observeMotion(document,withObserver?Observer:null);
  return {scene,opening,intro,document,listeners,motion,intersection(visible){callback([{target:scene,isIntersecting:visible}]);}};
}
test('apenas um céu anima durante a abertura e a saída',()=>{
  const {scene,opening,intro,motion}=setup();
  assert.equal(scene.dataset.motion,'paused');
  assert.equal(opening.dataset.motion,'running');
  intro.leaving=true;motion.sync();
  assert.equal(scene.dataset.motion,'running');
  assert.equal(opening.dataset.motion,'paused');
  intro.hidden=true;motion.sync();
  assert.equal(scene.dataset.motion,'running');
});
test('rolar além do céu pausa os efeitos; retornar retoma sem recriar a cena',()=>{
  const {scene,intro,motion,intersection}=setup();
  intro.hidden=true;motion.sync();
  intersection(false);assert.equal(scene.dataset.motion,'paused');
  intersection(true);assert.equal(scene.dataset.motion,'running');
});
test('segundo plano pausa tudo e retomar não anima um céu fora da tela',()=>{
  const {scene,opening,intro,document,listeners,motion,intersection}=setup();
  document.hidden=true;listeners.visibilitychange();
  assert.equal(scene.dataset.motion,'paused');assert.equal(opening.dataset.motion,'paused');
  intro.hidden=true;intersection(false);document.hidden=false;listeners.visibilitychange();
  assert.equal(scene.dataset.motion,'paused');
  intersection(true);assert.equal(scene.dataset.motion,'running');
});
test('navegador sem IntersectionObserver mantém o céu funcionando',()=>{
  const {scene,intro,motion}=setup(false);intro.hidden=true;motion.sync();
  assert.equal(scene.dataset.motion,'running');
  assert.doesNotThrow(()=>observeMotion({}));
});
