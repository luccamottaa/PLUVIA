const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const moonView=require('../dist/modules/moon-view.js');
const skyView=require('../dist/modules/sky-atmosphere.js');
const html=fs.readFileSync('dist/index.html','utf8');

test('intro, céu e card compartilham um disco e uma textura lunar',()=>{
  assert.equal([...html.matchAll(/id="moonDisc"/g)].length,1);
  assert.equal([...html.matchAll(/id="moonIcon"/g)].length,1);
  assert.equal([...html.matchAll(/href="#moonDisc"/g)].length,3);
  assert.equal([...html.matchAll(/href="\.\/assets\/moon-surface\.webp"/g)].length,1);
  assert.ok(html.indexOf('modules/moon-view.js?v=')<html.indexOf('modules/sky-atmosphere.js?v='));
});

test('relógio da atmosfera atualiza a fase e limpa disco e brilho quando ela falta',()=>{
  const fields=Object.fromEntries(['moonDisc','moonIcon','moonPhase'].map(id=>[id,{setAttribute(k,v){this[k]=v;}}]));
  const style={values:{},setProperty(k,v){this.values[k]=v;}};
  const document={getElementById:id=>fields[id],documentElement:{dataset:{},style}};
  const moon=moonView.create({document,getIllumination:date=>({phase:date.getUTCHours()/24})});
  const sky=skyView.create({document,moonView:moon});
  const quarter=Date.parse('2026-09-30T06:00:00Z');
  sky.apply(0,0,null,null,quarter);
  assert.equal(fields.moonPhase.textContent,'Quarto crescente');
  assert.equal(fields.moonDisc.visibility,'visible');
  assert.equal(style.values['--moon-light'],'0.500');
  sky.update(Date.parse('2026-09-30T12:00:00Z'));
  assert.equal(fields.moonPhase.textContent,'Lua cheia');
  assert.equal(style.values['--moon-light'],'1.000');
  sky.update(NaN);
  assert.equal(fields.moonDisc.visibility,'hidden');
  assert.equal(fields.moonPhase.textContent,'Fase indisponível');
  assert.equal(style.values['--moon-light'],'0.000');
});

test('abertura antes de montar o DOM e falha da efeméride não quebram o céu',()=>{
  assert.doesNotThrow(()=>moonView.create().update());
  const moon=moonView.create({getIllumination(){throw new Error('unavailable');}});
  const state=skyView.create({moonView:moon}).apply(0,0);
  assert.equal(state.phase,'night');
});
test('percentual e brilho usam a fração iluminada devolvida pela efeméride compartilhada',()=>{
 const result=moonView.create({getIllumination:()=>({phase:.25,fraction:.47})}).update(Date.parse('2026-10-03T12:00Z'));
 assert.equal(result.fraction,.47);assert.equal(result.label,'Quarto crescente');
});
