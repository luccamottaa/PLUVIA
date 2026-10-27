// Arco-íris e estrela cadente (1.36): só com gatilho real (chuva fraca com o Sol baixo; noite de pico de chuva de meteoros).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {create,rainbow}=require('../dist/modules/sky-atmosphere.js');
const city={id:'1302603',lat:-3.119,lon:-60.022,timezone:'America/Manaus'};

test('arco-íris só com chuva fraca/garoa, de dia, e o Sol entre 3° e 42°',()=>{
  for(const code of [51,53,61,80]) assert.equal(rainbow(code,'day',20),true,String(code));
  for(const code of [0,2,3,45,55,63,65,81,82,95]) assert.equal(rainbow(code,'day',20),false,String(code));
  assert.equal(rainbow(80,'night',20),false);
  assert.equal(rainbow(80,'day',50),false,'Sol alto: o arco fica abaixo do horizonte');
  assert.equal(rainbow(80,'day',1),false,'Sol no horizonte');
  assert.equal(rainbow(80,'day',NaN),false,'sem posição do Sol não inventa');
});

test('o céu escreve o arco-íris do lado oposto ao Sol, e o tira ao meio-dia',()=>{
  const context=vm.createContext({});
  vm.runInContext(fs.readFileSync('dist/vendor/suncalc.js','utf8'),context);
  assert.equal(typeof context.PLUVIA.sun.getPosition,'function');
  const vars={},root={dataset:{},style:{setProperty(){}}},body={dataset:{},style:{setProperty(){}}};
  const scene={dataset:{},style:{setProperty(key,value){vars[key]=value;}}};
  const document={documentElement:root,body,querySelectorAll(){return [scene];},querySelector(){return null;}};
  const sky=create({document,sun:context.PLUVIA.sun});
  const afternoon=Date.parse('2026-10-27T16:30:00-04:00');
  sky.apply(80,1,null,city,afternoon);
  assert.equal(root.dataset.rainbow,'on');
  assert.ok(+vars['--rainbow-x']<.5,'Sol à tarde no oeste (direita): arco à esquerda');
  assert.ok(+vars['--rainbow-lift']>0 && +vars['--rainbow-lift']<1);
  sky.apply(80,1,null,city,Date.parse('2026-10-27T12:00:00-04:00'));
  assert.equal(root.dataset.rainbow,'off','Sol alto ao meio-dia');
  sky.apply(63,1,null,city,afternoon);
  assert.equal(root.dataset.rainbow,'off','chuva moderada: sem arco-íris');
});

test('estrela cadente só na noite de pico, em céu limpo/parcial; movimento reduzido some',()=>{
  const css=fs.readFileSync('dist/sky.css','utf8'),app=fs.readFileSync('dist/app.js','utf8'),html=fs.readFileSync('dist/index.html','utf8');
  assert.match(html,/<div class="sky-effects"[^>]*><span class="sky-stars"><\/span><span class="sky-meteor"><\/span><span class="sky-rainbow"><\/span>/);
  assert.match(css,/:root\[data-meteors="on"\]\[data-phase="night"\]:is\(\[data-weather="sun"\],\[data-weather="partly"\]\) \.sky-meteor \{ display:block; \}/);
  assert.match(css,/prefers-reduced-motion:reduce\) \{ \.sky-meteor \{ display:none !important; \} \}/);
  assert.match(app,/setMeteorNight\(Boolean\(shower\) && Math\.abs\(/);
  // Só transform/opacity nas animações novas.
  for(const name of ['sky-meteor-a','sky-meteor-b']) {
    const body=css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))[1];
    assert.doesNotMatch(body.replace(/opacity|transform|translate3d|rotate|calc|vw|vh|px|deg/g,''),/[a-z]{3,}\s*:/);
  }
});
